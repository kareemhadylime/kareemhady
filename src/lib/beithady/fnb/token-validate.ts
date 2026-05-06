import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// NOTE: There is no Guesty live-API reservation fetcher in this codebase —
// all reservation data is read from the DB mirror (guesty_reservations +
// guesty_listings). Building code is denormalized onto beithady_boarding_passes
// at dispatch time, so we don't need a listing join.

export type DineTokenContext =
  | {
      ok: true;
      token: string;
      reservation_id: string;
      building_code: string;
      unit_code: string;
      guest_name: string | null;
      guest_language: 'en' | 'ar' | 'ru' | 'fr';
      guest_wa: string | null;
      reservation_status: 'checked_in' | 'reserved' | 'confirmed' | 'checked_out' | 'cancelled' | 'inquiry';
    }
  | {
      ok: false;
      reason:
        | 'token_not_found'
        | 'reservation_not_found'
        | 'reservation_not_checked_in'
        | 'building_disabled'
        | 'building_not_egypt';
    };

export async function validateDineToken(token: string): Promise<DineTokenContext> {
  // Short-circuit before any DB call for obviously invalid tokens
  if (!token || token.length < 10) return { ok: false, reason: 'token_not_found' };

  const sb = supabaseAdmin();

  // 1. Boarding-pass row — building_code is denormalized at dispatch time,
  //    listing_id is the unit identifier (maps to listing_nickname as unit_code).
  const { data: bp } = await sb
    .from('beithady_boarding_passes')
    .select('token, reservation_id, building_code, listing_id, guest_id')
    .eq('token', token)
    .maybeSingle();
  if (!bp) return { ok: false, reason: 'token_not_found' };
  const pass = bp as {
    token: string;
    reservation_id: string;
    building_code: string | null;
    listing_id: string | null;
    guest_id: string | null;
  };

  // 2. Reservation from DB mirror — status is the Guesty-synced value.
  const { data: res } = await sb
    .from('guesty_reservations')
    .select('status, listing_id, listing_nickname, guest_name, guest_phone')
    .eq('id', pass.reservation_id)
    .maybeSingle();
  if (!res) return { ok: false, reason: 'reservation_not_found' };
  const r = res as {
    status: string | null;
    listing_id: string | null;
    listing_nickname: string | null;
    guest_name: string | null;
    guest_phone: string | null;
  };

  if (r.status !== 'checked_in') {
    return { ok: false, reason: 'reservation_not_checked_in' };
  }

  // 3. Building enabled? Use the building_code from the boarding pass
  //    (denormalized at dispatch) — fall back to guesty_listings join
  //    if somehow missing.
  let buildingCode = pass.building_code;
  if (!buildingCode && (pass.listing_id || r.listing_id)) {
    const listingId = pass.listing_id || r.listing_id;
    const { data: listing } = await sb
      .from('guesty_listings')
      .select('building_code')
      .eq('id', listingId!)
      .maybeSingle();
    buildingCode = (listing as { building_code: string | null } | null)?.building_code ?? null;
  }
  if (!buildingCode) return { ok: false, reason: 'building_not_egypt' };

  const { data: bld } = await sb
    .from('fnb_buildings')
    .select('building_code, enabled')
    .eq('building_code', buildingCode)
    .maybeSingle();
  if (!bld) return { ok: false, reason: 'building_not_egypt' };
  if (!(bld as { enabled: boolean }).enabled) return { ok: false, reason: 'building_disabled' };

  // 4. Guest language — prefer beithady_guests.language (CRM), fall back to
  //    raw Guesty phone for WA. listing_nickname is the human-readable unit code.
  let guestLanguage: 'en' | 'ar' | 'ru' | 'fr' = 'en';
  let guestWa: string | null = null;
  let guestName: string | null = r.guest_name;

  if (pass.guest_id) {
    const { data: g } = await sb
      .from('beithady_guests')
      .select('language, phone_e164, full_name')
      .eq('id', pass.guest_id)
      .maybeSingle();
    if (g) {
      const guest = g as { language: string | null; phone_e164: string | null; full_name: string | null };
      guestLanguage = pickLang(guest.language);
      guestWa = guest.phone_e164;
      if (guest.full_name) guestName = guest.full_name;
    }
  }

  // Fallback WA from guesty_reservations.guest_phone (raw E.164-ish string)
  if (!guestWa && r.guest_phone) {
    guestWa = '+' + r.guest_phone.replace(/[^0-9]/g, '');
  }

  // unit_code: Guesty listing_nickname is the human-readable unit identifier
  // (e.g. "BH-26-101"). Listing ID is the opaque Guesty ObjectId.
  const unitCode = r.listing_nickname ?? pass.listing_id ?? '';

  return {
    ok: true,
    token,
    reservation_id: pass.reservation_id,
    building_code: buildingCode,
    unit_code: unitCode,
    guest_name: guestName,
    guest_language: guestLanguage,
    guest_wa: guestWa,
    reservation_status: 'checked_in',
  };
}

function pickLang(raw: string | null | undefined): 'en' | 'ar' | 'ru' | 'fr' {
  const s = (raw ?? 'en').toLowerCase();
  if (s.startsWith('ar')) return 'ar';
  if (s.startsWith('ru')) return 'ru';
  if (s.startsWith('fr')) return 'fr';
  return 'en';
}
