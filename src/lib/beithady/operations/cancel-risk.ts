import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type AtRiskReservation = {
  reservation_id: string;
  listing_id: string;
  listing_nickname: string | null;
  building_code: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  channel: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number | null;
  status: string | null;
  cancel_risk_score: number;
  cancel_risk_breakdown: Record<string, number> | null;
  payment_status: string | null;
  payment_balance_cents: number | null;
  last_reconfirmation_sent_at: string | null;
  reconfirmation_response: string | null;
  is_vip: boolean | null;
  loyalty_tier: string | null;
};

export async function listAtRiskReservations(opts: {
  minScore?: number;          // default 50
  maxDaysAhead?: number;      // default 21
}): Promise<AtRiskReservation[]> {
  const sb = supabaseAdmin();
  const minScore = opts.minScore ?? 50;
  const maxDays = opts.maxDaysAhead ?? 21;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const cutoff = new Date(today.getTime() + maxDays * 86400000).toISOString().slice(0, 10);

  // Pull from the grid view, then join overrides (the view doesn't expose
  // cancel_risk_score yet in its SELECT — we re-join here for V1).
  const { data: grid } = await sb
    .from('beithady_reservation_grid_v')
    .select('reservation_id, listing_id, listing_nickname, building_code, guest_name, guest_email, guest_phone, channel, check_in_date, check_out_date, nights, status, payment_status, payment_balance_cents, is_vip, loyalty_tier')
    .gte('check_in_date', todayIso)
    .lte('check_in_date', cutoff)
    .neq('status', 'canceled');

  const ids = ((grid as Array<{ reservation_id: string }> | null) || []).map(r => r.reservation_id);
  if (ids.length === 0) return [];
  const { data: overrides } = await sb
    .from('beithady_reservation_overrides')
    .select('reservation_id, cancel_risk_score, cancel_risk_breakdown, last_reconfirmation_sent_at, reconfirmation_response')
    .in('reservation_id', ids)
    .gte('cancel_risk_score', minScore);

  const overrideById = new Map<string, {
    cancel_risk_score: number;
    cancel_risk_breakdown: Record<string, number> | null;
    last_reconfirmation_sent_at: string | null;
    reconfirmation_response: string | null;
  }>();
  for (const o of (overrides as Array<{
    reservation_id: string;
    cancel_risk_score: number;
    cancel_risk_breakdown: Record<string, number> | null;
    last_reconfirmation_sent_at: string | null;
    reconfirmation_response: string | null;
  }> | null) || []) {
    overrideById.set(o.reservation_id, {
      cancel_risk_score: o.cancel_risk_score,
      cancel_risk_breakdown: o.cancel_risk_breakdown,
      last_reconfirmation_sent_at: o.last_reconfirmation_sent_at,
      reconfirmation_response: o.reconfirmation_response,
    });
  }

  type GridRow = {
    reservation_id: string; listing_id: string; listing_nickname: string | null;
    building_code: string | null; guest_name: string | null; guest_email: string | null;
    guest_phone: string | null; channel: string | null; check_in_date: string;
    check_out_date: string; nights: number | null; status: string | null;
    payment_status: string | null; payment_balance_cents: number | null;
    is_vip: boolean | null; loyalty_tier: string | null;
  };

  const out: AtRiskReservation[] = [];
  for (const r of (grid as GridRow[] | null) || []) {
    const o = overrideById.get(r.reservation_id);
    if (!o) continue;
    out.push({
      ...r,
      cancel_risk_score: o.cancel_risk_score,
      cancel_risk_breakdown: o.cancel_risk_breakdown,
      last_reconfirmation_sent_at: o.last_reconfirmation_sent_at,
      reconfirmation_response: o.reconfirmation_response,
    });
  }
  return out.sort((a, b) => b.cancel_risk_score - a.cancel_risk_score);
}
