import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Common helpers for the Phase F crons: pull upcoming arrivals,
// recently checked-out reservations, and resolve guest_id by phone/
// email match against beithady_guests.

export type UpcomingReservation = {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  building_code: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  status: string | null;
  source: string | null;
};

// Reservations whose check-in falls in [hoursMin, hoursMax) from now.
// Used by both pre-arrival (-24h) and upsell (-48h) crons.
export async function getUpcomingArrivals(hoursMin: number, hoursMax: number): Promise<UpcomingReservation[]> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const minDate = new Date(now + hoursMin * 3600e3).toISOString().slice(0, 10);
  const maxDate = new Date(now + hoursMax * 3600e3).toISOString().slice(0, 10);
  const { data } = await sb
    .from('guesty_reservations')
    .select('id, guest_name, guest_email, guest_phone, listing_id, listing_nickname, check_in_date, check_out_date, nights, status, source, raw')
    .gte('check_in_date', minDate)
    .lte('check_in_date', maxDate)
    .not('status', 'eq', 'canceled')
    .not('status', 'eq', 'cancelled')
    .not('status', 'eq', 'declined')
    .not('status', 'eq', 'inquiry');
  // Add building_code by joining listing
  const rows = (data as Array<UpcomingReservation & { raw?: Record<string, unknown> }> | null) || [];
  const listingIds = Array.from(new Set(rows.map(r => r.listing_id).filter((x): x is string => !!x)));
  const listingMap = new Map<string, string | null>();
  if (listingIds.length) {
    const { data: listings } = await sb
      .from('guesty_listings')
      .select('id, building_code')
      .in('id', listingIds);
    for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) || []) {
      listingMap.set(l.id, l.building_code);
    }
  }
  return rows.map(r => ({ ...r, building_code: r.listing_id ? listingMap.get(r.listing_id) ?? null : null }));
}

// Reservations whose check-OUT was in [hoursMin, hoursMax] hours ago.
// Used by CSAT (+24h post-checkout).
export async function getRecentCheckouts(hoursMin: number, hoursMax: number): Promise<UpcomingReservation[]> {
  const sb = supabaseAdmin();
  const now = Date.now();
  const minDate = new Date(now - hoursMax * 3600e3).toISOString().slice(0, 10);
  const maxDate = new Date(now - hoursMin * 3600e3).toISOString().slice(0, 10);
  const { data } = await sb
    .from('guesty_reservations')
    .select('id, guest_name, guest_email, guest_phone, listing_id, listing_nickname, check_in_date, check_out_date, nights, status, source')
    .gte('check_out_date', minDate)
    .lte('check_out_date', maxDate)
    .in('status', ['confirmed', 'checked_in', 'checked_out']);
  const rows = (data as Array<UpcomingReservation> | null) || [];
  const listingIds = Array.from(new Set(rows.map(r => r.listing_id).filter((x): x is string => !!x)));
  const listingMap = new Map<string, string | null>();
  if (listingIds.length) {
    const { data: listings } = await sb
      .from('guesty_listings')
      .select('id, building_code')
      .in('id', listingIds);
    for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) || []) {
      listingMap.set(l.id, l.building_code);
    }
  }
  return rows.map(r => ({ ...r, building_code: r.listing_id ? listingMap.get(r.listing_id) ?? null : null }));
}

// Match Guesty reservation guest to beithady_guests row. Returns null
// if no match — caller decides whether to skip or create lazily.
export async function matchBeithadyGuest(
  email: string | null,
  phone: string | null
): Promise<{ id: string; phone_e164: string | null; full_name: string | null; vip: boolean; loyalty_tier: string } | null> {
  if (!email && !phone) return null;
  const sb = supabaseAdmin();
  const phoneE164 = phone ? '+' + phone.replace(/[^0-9]/g, '') : null;
  let q = sb.from('beithady_guests').select('id, phone_e164, full_name, vip, loyalty_tier');
  if (email) q = q.eq('email', email.toLowerCase());
  else if (phoneE164) q = q.eq('phone_e164', phoneE164);
  const { data } = await q.limit(1).maybeSingle();
  if (data) return data as {
    id: string; phone_e164: string | null; full_name: string | null; vip: boolean; loyalty_tier: string;
  };
  // Try phone fallback if email lookup missed
  if (email && phoneE164) {
    const { data: byPhone } = await sb
      .from('beithady_guests')
      .select('id, phone_e164, full_name, vip, loyalty_tier')
      .eq('phone_e164', phoneE164)
      .limit(1)
      .maybeSingle();
    if (byPhone) return byPhone as {
      id: string; phone_e164: string | null; full_name: string | null; vip: boolean; loyalty_tier: string;
    };
  }
  return null;
}

// Random URL-safe token (Node crypto). 24 bytes = 192 bits of entropy.
export function mintToken(bytes = 24): string {
  // Use Web Crypto for edge-runtime compatibility; node:crypto has the
  // same API since 16.x in the runtime context where these helpers run.
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Buffer.from(arr).toString('base64url');
}

export function templateRender(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}
