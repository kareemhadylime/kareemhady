import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Retroactive attribution sweep — runs daily 07:00 Cairo. The
// per-row trigger handles forward-flow (insert/update on
// guesty_reservations); this sweep catches anything missed (e.g.,
// a lead arriving AFTER the reservation, or backfilled reservations).

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();
  try {
    // Find unmatched leads (last 90d) and try to match them against
    // recent reservations.
    const cutoff = new Date(Date.now() - 90 * 86400e3).toISOString();
    const { data: unmatched } = await sb
      .from('ads_leads')
      .select('id, phone_e164, created_at')
      .is('matched_reservation_id', null)
      .gte('created_at', cutoff);
    let matched = 0;
    for (const l of (unmatched as Array<{ id: number; phone_e164: string | null; created_at: string }> | null) || []) {
      if (!l.phone_e164) continue;
      const { data: r } = await sb
        .from('guesty_reservations')
        .select('id')
        .eq('guest_phone', l.phone_e164.replace(/^\+/, ''))
        .gte('created_at_odoo', l.created_at)
        .order('created_at_odoo', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (r) {
        await sb.from('ads_leads').update({
          matched_reservation_id: (r as { id: string }).id,
          matched_at: new Date().toISOString(),
        }).eq('id', l.id);
        matched++;
      }
    }
    await recordAudit({
      module: 'ads',
      action: 'attribution_sweep',
      metadata: { unmatched_considered: ((unmatched as Array<unknown> | null)?.length || 0), newly_matched: matched },
    });
    return NextResponse.json({ ok: true, considered: (unmatched as Array<unknown> | null)?.length || 0, matched });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
