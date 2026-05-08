import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Late-reply digest — runs at 09:00 + 15:00 Cairo (06:00 + 12:00 UTC).
// Compiles a per-conversation summary of every red SLA breach (>12h
// waiting on us) so the ops team has a single morning + midday view.
//
// Phase C.2 deliverable: produce + persist the digest. Actual email +
// WhatsApp delivery to ops lands in Phase F (when the unified
// notification channel is established).

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[cron beithady-late-reply-digest] CRON_SECRET unset — refusing');
    return false;
  }
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const sb = supabaseAdmin();
  try {
    // Refresh SLA buckets first so the digest reflects "now" not "last cron".
    await sb.rpc('beithady_communication_sla_recompute');

    // Pull every red breach with denormalized fields the digest needs.
    const { data: breaches } = await sb
      .from('beithady_conversations')
      .select(
        'id, channel, external_id, source, guest_full_name, guest_email, guest_phone, listing_nickname, building_code, last_inbound_at, sla_age_seconds, ai_kill_switch'
      )
      .eq('state', 'open')
      .eq('sla_bucket', 'red')
      .order('sla_age_seconds', { ascending: false })
      .limit(200);

    const rows = (breaches as Array<{
      id: string;
      channel: string;
      external_id: string;
      source: string | null;
      guest_full_name: string | null;
      guest_email: string | null;
      guest_phone: string | null;
      listing_nickname: string | null;
      building_code: string | null;
      last_inbound_at: string | null;
      sla_age_seconds: number | null;
      ai_kill_switch: boolean;
    }> | null) || [];

    const summary = {
      generated_at: new Date().toISOString(),
      total_red_breaches: rows.length,
      by_building: tally(rows, r => r.building_code),
      by_source: tally(rows, r => r.source),
      top_20: rows.slice(0, 20).map(r => ({
        conversation_id: r.id,
        guest: r.guest_full_name || r.guest_email || r.guest_phone,
        listing: r.listing_nickname,
        building: r.building_code,
        source: r.source,
        last_inbound_at: r.last_inbound_at,
        age_hours: r.sla_age_seconds ? Math.round(r.sla_age_seconds / 360) / 10 : null,
        ai_kill_switch: r.ai_kill_switch,
        guesty_inbox_url: r.channel === 'guesty' ? `https://app.guesty.com/inbox/${r.external_id}` : null,
      })),
    };

    // Persist to beithady_settings under a rotating key so historical
    // digests are queryable and the most recent is always at
    // 'late_reply_digest_latest'.
    const dateKey = new Date().toISOString().slice(0, 13).replace(/[:T]/g, '_');
    await Promise.all([
      sb.from('beithady_settings').upsert(
        { key: 'late_reply_digest_latest', value: summary as unknown as object, description: 'Most recent late-reply digest output (auto-overwritten).' },
        { onConflict: 'key' }
      ),
      sb.from('beithady_settings').upsert(
        { key: `late_reply_digest_${dateKey}`, value: summary as unknown as object, description: `Late-reply digest snapshot ${dateKey}.` },
        { onConflict: 'key' }
      ),
    ]);

    await recordAudit({
      module: 'communication',
      action: 'late_reply_digest_generated',
      metadata: {
        total_red_breaches: summary.total_red_breaches,
        by_building: summary.by_building,
        delivery_pending_phase: 'F',
      },
    });

    return NextResponse.json({ ok: true, total_red_breaches: rows.length, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function tally<T>(rows: T[], pick: (r: T) => string | null): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r);
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}
