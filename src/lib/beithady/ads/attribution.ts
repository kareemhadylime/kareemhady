import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// 90-day phone-match attribution: connect ads_leads to guesty_reservations.
// The DB-level trigger handles the live "new reservation" case (see
// beithady_ads_match_lead_to_reservation in 0040_beithady_ads.sql). This
// helper does the inverse sweep: scan unmatched leads from the past 90
// days and find any reservation that matches by phone_e164.
//
// Used by both the Phase H cron route and now extended to all platforms
// (meta/google/tiktok) since lead_source can be anything that captures phone.

export type AttributionResult = {
  ok: boolean;
  unmatched_considered: number;
  newly_matched: number;
  duration_ms: number;
  error?: string;
};

export async function runLeadAttributionSweep(): Promise<AttributionResult> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();

  // Pull unmatched leads from last 90 days with a phone_e164 set
  const { data: leadsRaw, error } = await sb
    .from('ads_leads')
    .select('id, phone_e164, platform, created_at')
    .is('matched_reservation_id', null)
    .not('phone_e164', 'is', null)
    .gt('created_at', cutoff)
    .limit(2000);
  if (error) {
    return { ok: false, unmatched_considered: 0, newly_matched: 0, duration_ms: Date.now() - t0, error: error.message };
  }
  const leads = (leadsRaw as Array<{ id: number; phone_e164: string; platform: string; created_at: string }> | null) || [];
  if (!leads.length) {
    return { ok: true, unmatched_considered: 0, newly_matched: 0, duration_ms: Date.now() - t0 };
  }

  // Collect unique phones
  const phoneToLeadIds = new Map<string, number[]>();
  for (const l of leads) {
    const arr = phoneToLeadIds.get(l.phone_e164) || [];
    arr.push(l.id);
    phoneToLeadIds.set(l.phone_e164, arr);
  }
  const phones = Array.from(phoneToLeadIds.keys());

  // Look up reservations for those phones (we only care about ones at or
  // after the lead's created_at — DB stores guest_phone as raw, so we
  // normalize via guesty_reservations.phone_e164 computed at sync time, or
  // fallback by stripping non-digits at query time).
  const { data: resRaw } = await sb
    .from('guesty_reservations')
    .select('id, guest_phone, check_in_date, created_at_odoo')
    .in(
      'guest_phone',
      phones
        .map(p => p.replace(/^\+/, ''))
        .concat(phones)
    );
  type ReservationRow = { id: string; guest_phone: string; check_in_date: string | null; created_at_odoo: string | null };
  const reservations = (resRaw as ReservationRow[] | null) || [];

  let matched = 0;
  for (const r of reservations) {
    const normalized = '+' + (r.guest_phone || '').replace(/[^0-9]/g, '');
    const leadIds = phoneToLeadIds.get(normalized) || [];
    if (!leadIds.length) continue;
    // Match the most recent lead before the reservation
    for (const leadId of leadIds) {
      const upd = await sb
        .from('ads_leads')
        .update({ matched_reservation_id: r.id, matched_at: new Date().toISOString() })
        .eq('id', leadId)
        .is('matched_reservation_id', null);
      if (!upd.error) matched += 1;
    }
  }

  return {
    ok: true,
    unmatched_considered: leads.length,
    newly_matched: matched,
    duration_ms: Date.now() - t0,
  };
}
