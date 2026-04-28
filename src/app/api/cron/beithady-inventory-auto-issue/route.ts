import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { computeAutoIssueLines, nextIssueNo } from '@/lib/beithady/inventory/issue';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily auto-issue cron — Cairo ~14:00 (post-check-in time).
// Scans confirmed reservations checking in today (+ yesterday catch-up),
// computes consumption rules, creates auto_rule issues, auto-posts them.
// Idempotency via UNIQUE index on (ref_reservation_id, item_id, warehouse_id)
// for type=reservation_hold transactions (set up in migration 0048b).

const CAIRO_HOUR_MIN = 13; // 14:00 Cairo = 12:00 UTC (DST-safe via Intl)
const CAIRO_HOUR_MAX = 16;

function cairoHour(): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
}

export async function GET(req: NextRequest) {
  // Bearer-auth gate
  const authHeader = req.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Cairo-hour gate (skip the redundant UTC tick when not Cairo 14:00 ± window)
  const ch = cairoHour();
  if (!force && (ch < CAIRO_HOUR_MIN || ch > CAIRO_HOUR_MAX)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Cairo hour ${ch} outside window ${CAIRO_HOUR_MIN}-${CAIRO_HOUR_MAX}. Use ?force=1 to override.`,
    });
  }

  const sb = supabaseAdmin();

  // Find pending reservations
  const { data: pending, error } = await sb.rpc('beithady_inv_pending_auto_issues', { p_window_days: 0 });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  type Pending = {
    reservation_id: string; building_code: string; listing_id: string;
    guests_count: number; nights: number; check_in_date: string; check_out_date: string;
  };
  const pendingRows = (pending as Pending[] | null) || [];

  let createdCount = 0;
  let postedCount = 0;
  let skippedNoRules = 0;
  let skippedNoWarehouse = 0;
  const errors: Array<{ reservation_id: string; error: string }> = [];

  for (const r of pendingRows) {
    try {
      const computation = await computeAutoIssueLines({
        id: r.reservation_id,
        building_code: r.building_code,
        listing_id: r.listing_id,
        guests: r.guests_count,
        nights: r.nights,
      });

      if (!computation.warehouse_id) { skippedNoWarehouse++; continue; }
      if (computation.lines.length === 0) { skippedNoRules++; continue; }

      const issue_no = await nextIssueNo();
      const { data: header, error: hErr } = await sb
        .from('beithady_inventory_issues')
        .insert({
          issue_no,
          status: 'approved', // auto_rule fires past the approval gate (per_reservation always-auto in approval matrix)
          type: 'per_reservation',
          warehouse_id: computation.warehouse_id,
          ref_reservation_id: r.reservation_id,
          notes: `Auto-issued by consumption rules cron at Cairo ${ch}h on ${new Date().toISOString().slice(0, 10)} for ${r.guests_count} guest(s) × ${r.nights} night(s).`,
          created_via: 'auto_rule',
          created_by_user: 'cron_auto_issue',
          approver_user: 'cron_auto_issue',
          approved_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (hErr || !header) { errors.push({ reservation_id: r.reservation_id, error: hErr?.message || 'header insert failed' }); continue; }

      const linesToInsert = computation.lines.map((l, i) => ({
        issue_id: header.id,
        line_no: i + 1,
        item_id: l.item_id,
        qty: l.qty,
        batch_no_picked: '__bulk__',
        note: `${l.formula_kind} (rule ${l.rule_id})`,
      }));
      const { error: lErr } = await sb.from('beithady_inventory_issue_lines').insert(linesToInsert);
      if (lErr) {
        await sb.from('beithady_inventory_issues').delete().eq('id', header.id);
        errors.push({ reservation_id: r.reservation_id, error: lErr.message });
        continue;
      }

      createdCount++;

      // Auto-post immediately
      const { error: pErr } = await sb.rpc('beithady_inv_post_issue', {
        p_issue_id: header.id,
        p_actor_user: 'cron_auto_issue',
      });
      if (pErr) {
        // Posting failed — leave the issue in approved state for manual intervention
        errors.push({ reservation_id: r.reservation_id, error: `posting: ${pErr.message}` });
      } else {
        postedCount++;
      }
    } catch (e) {
      errors.push({ reservation_id: r.reservation_id, error: (e instanceof Error ? e.message : String(e)) });
    }
  }

  await recordAudit({
    actor_user_id: null,
    module: 'inventory',
    action: 'cron.auto_issue_run',
    metadata: {
      cairo_hour: ch,
      pending: pendingRows.length,
      created: createdCount,
      posted: postedCount,
      skipped_no_rules: skippedNoRules,
      skipped_no_warehouse: skippedNoWarehouse,
      error_count: errors.length,
    },
  });

  return NextResponse.json({
    ok: true,
    cairo_hour: ch,
    pending: pendingRows.length,
    created: createdCount,
    posted: postedCount,
    skipped_no_rules: skippedNoRules,
    skipped_no_warehouse: skippedNoWarehouse,
    errors,
  });
}
