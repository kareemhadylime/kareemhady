import { supabaseAdmin } from './supabase';

// Enrichment layer over email-parsed Beithady rules.
//
// Email parsers produce their best-effort view of a booking/payout/review.
// When we have authoritative data from Guesty (and pricing from PriceLabs),
// we overlay it: Guesty wins on conflict (user direction 2026-04-21).
//
// The contract is intentionally partial — email parsers still run, we just
// augment each output row with the trusted fields from the mirror tables.

export type GuestyReservationLite = {
  id: string;
  confirmation_code: string | null;
  platform_confirmation_code: string | null;
  status: string | null;
  source: string | null;
  integration_platform: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  guest_name: string | null;
  guest_email: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests: number | null;
  currency: string | null;
  host_payout: number | null;
  guest_paid: number | null;
  fare_accommodation: number | null;
  cleaning_fee: number | null;
  building_code: string | null; // from listing join
};

// Fetch a reservation authoritative record. Priority of match keys:
//   1. platform_confirmation_code (Airbnb HM-xxx / Booking code)
//   2. confirmation_code (Guesty's own code)
// Both paths fall back to null when nothing matches.
export async function lookupGuestyReservation(
  codes: {
    platformCode?: string | null;
    guestyCode?: string | null;
  }
): Promise<GuestyReservationLite | null> {
  const sb = supabaseAdmin();
  const candidates: Array<{ col: string; val: string }> = [];
  if (codes.platformCode) {
    candidates.push({
      col: 'platform_confirmation_code',
      val: String(codes.platformCode).trim(),
    });
  }
  if (codes.guestyCode) {
    candidates.push({
      col: 'confirmation_code',
      val: String(codes.guestyCode).trim(),
    });
  }
  if (candidates.length === 0) return null;

  for (const c of candidates) {
    const { data } = await sb
      .from('guesty_reservations')
      .select(
        `
        id, confirmation_code, platform_confirmation_code, status, source,
        integration_platform, listing_id, listing_nickname, guest_name,
        guest_email, check_in_date, check_out_date, nights, guests, currency,
        host_payout, guest_paid, fare_accommodation, cleaning_fee,
        guesty_listings!left(building_code)
      `
      )
      .eq(c.col, c.val)
      .limit(1)
      .maybeSingle();
    if (data) {
      const row = data as unknown as Record<string, unknown> & {
        guesty_listings?: { building_code?: string | null } | null;
      };
      const building =
        row.guesty_listings?.building_code ?? null;
      return {
        id: String(row.id),
        confirmation_code: (row.confirmation_code as string) || null,
        platform_confirmation_code:
          (row.platform_confirmation_code as string) || null,
        status: (row.status as string) || null,
        source: (row.source as string) || null,
        integration_platform: (row.integration_platform as string) || null,
        listing_id: (row.listing_id as string) || null,
        listing_nickname: (row.listing_nickname as string) || null,
        guest_name: (row.guest_name as string) || null,
        guest_email: (row.guest_email as string) || null,
        check_in_date: (row.check_in_date as string) || null,
        check_out_date: (row.check_out_date as string) || null,
        nights: (row.nights as number) ?? null,
        guests: (row.guests as number) ?? null,
        currency: (row.currency as string) || null,
        host_payout: (row.host_payout as number) ?? null,
        guest_paid: (row.guest_paid as number) ?? null,
        fare_accommodation: (row.fare_accommodation as number) ?? null,
        cleaning_fee: (row.cleaning_fee as number) ?? null,
        building_code: building,
      };
    }
  }
  return null;
}

// Batch-fetch many reservations by platform + Guesty codes in one round-trip.
// Each input row has a `key` (opaque caller id) + the codes to look up.
// Returns a Map<key, GuestyReservationLite> for hits.
export async function batchLookupGuestyReservations(
  items: Array<{
    key: string;
    platformCode?: string | null;
    guestyCode?: string | null;
  }>
): Promise<Map<string, GuestyReservationLite>> {
  if (items.length === 0) return new Map();
  const sb = supabaseAdmin();
  const out = new Map<string, GuestyReservationLite>();

  // Collect candidate codes
  const platformCodes = Array.from(
    new Set(
      items
        .map(i => i.platformCode?.trim())
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );
  const guestyCodes = Array.from(
    new Set(
      items
        .map(i => i.guestyCode?.trim())
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    )
  );

  // One query per code type, then stitch.
  const select = `
    id, confirmation_code, platform_confirmation_code, status, source,
    integration_platform, listing_id, listing_nickname, guest_name,
    guest_email, check_in_date, check_out_date, nights, guests, currency,
    host_payout, guest_paid, fare_accommodation, cleaning_fee,
    guesty_listings!left(building_code)
  `;
  const byPlatform = new Map<string, GuestyReservationLite>();
  const byGuesty = new Map<string, GuestyReservationLite>();

  if (platformCodes.length > 0) {
    const { data } = await sb
      .from('guesty_reservations')
      .select(select)
      .in('platform_confirmation_code', platformCodes);
    for (const r of (data || []) as Array<Record<string, unknown> & {
      guesty_listings?: { building_code?: string | null } | null;
    }>) {
      const lite = toLite(r);
      if (lite.platform_confirmation_code) {
        byPlatform.set(lite.platform_confirmation_code, lite);
      }
    }
  }
  if (guestyCodes.length > 0) {
    const { data } = await sb
      .from('guesty_reservations')
      .select(select)
      .in('confirmation_code', guestyCodes);
    for (const r of (data || []) as Array<Record<string, unknown> & {
      guesty_listings?: { building_code?: string | null } | null;
    }>) {
      const lite = toLite(r);
      if (lite.confirmation_code) byGuesty.set(lite.confirmation_code, lite);
    }
  }

  for (const i of items) {
    const p = i.platformCode?.trim();
    const g = i.guestyCode?.trim();
    const hit = (p && byPlatform.get(p)) || (g && byGuesty.get(g));
    if (hit) out.set(i.key, hit);
  }
  return out;
}

function toLite(
  row: Record<string, unknown> & {
    guesty_listings?: { building_code?: string | null } | null;
  }
): GuestyReservationLite {
  return {
    id: String(row.id),
    confirmation_code: (row.confirmation_code as string) || null,
    platform_confirmation_code:
      (row.platform_confirmation_code as string) || null,
    status: (row.status as string) || null,
    source: (row.source as string) || null,
    integration_platform: (row.integration_platform as string) || null,
    listing_id: (row.listing_id as string) || null,
    listing_nickname: (row.listing_nickname as string) || null,
    guest_name: (row.guest_name as string) || null,
    guest_email: (row.guest_email as string) || null,
    check_in_date: (row.check_in_date as string) || null,
    check_out_date: (row.check_out_date as string) || null,
    nights: (row.nights as number) ?? null,
    guests: (row.guests as number) ?? null,
    currency: (row.currency as string) || null,
    host_payout: (row.host_payout as number) ?? null,
    guest_paid: (row.guest_paid as number) ?? null,
    fare_accommodation: (row.fare_accommodation as number) ?? null,
    cleaning_fee: (row.cleaning_fee as number) ?? null,
    building_code: row.guesty_listings?.building_code ?? null,
  };
}

// Batch lookup reservations by guest_name + listing_name — used by review /
// inquiry / request aggregators where the email doesn't carry a booking code.
// Match is case-insensitive, tolerates extra whitespace, and prefers the
// most recent reservation when multiple hits. Returns a Map keyed on the
// caller's opaque `key`.
export async function batchLookupReservationsByGuest(
  items: Array<{
    key: string;
    guestName?: string | null;
    listingNickname?: string | null;
    nearCheckin?: string | null; // YYYY-MM-DD to prefer reservations overlapping this date
  }>
): Promise<Map<string, GuestyReservationLite>> {
  if (items.length === 0) return new Map();
  const sb = supabaseAdmin();
  const out = new Map<string, GuestyReservationLite>();

  // Deduplicate guest names for the batch query
  const names = Array.from(
    new Set(
      items
        .map(i => i.guestName?.trim().toLowerCase())
        .filter((n): n is string => !!n && n.length > 1)
    )
  );
  if (names.length === 0) return out;

  // Case-insensitive IN via or() with ilike patterns, capped to avoid URL overflow.
  const chunkSize = 40;
  const candidates: Array<Record<string, unknown>> = [];
  for (let i = 0; i < names.length; i += chunkSize) {
    const chunk = names.slice(i, i + chunkSize);
    const ors = chunk.map(n => `guest_name.ilike.${n.replace(/,/g, ' ')}`).join(',');
    const { data } = await sb
      .from('guesty_reservations')
      .select(
        `id, confirmation_code, platform_confirmation_code, status, source,
         integration_platform, listing_id, listing_nickname, guest_name,
         guest_email, check_in_date, check_out_date, nights, guests, currency,
         host_payout, guest_paid, fare_accommodation, cleaning_fee,
         guesty_listings!left(building_code)`
      )
      .or(ors)
      .order('check_in_date', { ascending: false })
      .limit(500);
    if (Array.isArray(data)) candidates.push(...(data as Array<Record<string, unknown>>));
  }

  // Index candidates by name+listing for fast match
  type Cand = Record<string, unknown> & {
    guesty_listings?: { building_code?: string | null } | null;
  };
  const byGuest = new Map<string, Cand[]>();
  for (const c of candidates as Cand[]) {
    const gn = String(c.guest_name || '').trim().toLowerCase();
    if (!gn) continue;
    const arr = byGuest.get(gn) || [];
    arr.push(c);
    byGuest.set(gn, arr);
  }

  for (const i of items) {
    const gn = i.guestName?.trim().toLowerCase();
    if (!gn) continue;
    const matches = byGuest.get(gn) || [];
    if (matches.length === 0) continue;

    // Prefer the match whose listing_nickname matches the email's listing_name
    // (case-insensitive substring match in either direction).
    let best: Cand | null = null;
    if (i.listingNickname) {
      const target = i.listingNickname.toLowerCase();
      best =
        matches.find(m => {
          const nick = String(m.listing_nickname || '').toLowerCase();
          return (
            nick &&
            (nick.includes(target) || target.includes(nick))
          );
        }) || null;
    }
    // Then prefer one whose check-in is near the hint date.
    if (!best && i.nearCheckin) {
      const target = new Date(i.nearCheckin).getTime();
      if (!Number.isNaN(target)) {
        best = matches.reduce<Cand | null>((acc, m) => {
          const ci = m.check_in_date
            ? new Date(String(m.check_in_date)).getTime()
            : NaN;
          if (Number.isNaN(ci)) return acc;
          if (!acc) return m;
          const prev = new Date(String(acc.check_in_date)).getTime();
          return Math.abs(ci - target) < Math.abs(prev - target) ? m : acc;
        }, null);
      }
    }
    // Fallback: most recent.
    if (!best) best = matches[0] || null;
    if (best) out.set(i.key, toLite(best));
  }

  return out;
}

// Batch resolve many listing nicknames → building_code in one query. Used
// by review / inquiry / request aggregators so every row gets the canonical
// BH-* tag even when the email carried only a friendly listing name.
// Match is case-insensitive; fuzzy fallback uses contains-either-direction.
export async function batchLookupBuildingsByListingName(
  names: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(
    new Set(
      names
        .map(n => (n ? n.trim() : ''))
        .filter(n => n.length >= 3)
    )
  );
  if (unique.length === 0) return out;

  const sb = supabaseAdmin();
  // Exact match pass first (O(1) lookups).
  const { data: exact } = await sb
    .from('guesty_listings')
    .select('nickname, title, building_code')
    .in('nickname', unique);
  for (const row of (exact as Array<{
    nickname: string | null;
    title: string | null;
    building_code: string | null;
  }> | null) || []) {
    if (row.nickname && row.building_code) {
      out.set(row.nickname.toLowerCase(), row.building_code);
    }
    if (row.title && row.building_code) {
      out.set(row.title.toLowerCase(), row.building_code);
    }
  }

  // Fuzzy fallback: for names we didn't resolve, pull all listings with
  // a building_code and substring-match. Small tenant (~100 listings) so
  // one pull is cheap.
  const unresolved = unique.filter(n => !out.has(n.toLowerCase()));
  if (unresolved.length > 0) {
    const { data: all } = await sb
      .from('guesty_listings')
      .select('nickname, title, building_code')
      .not('building_code', 'is', null);
    const catalog = (all as Array<{
      nickname: string | null;
      title: string | null;
      building_code: string | null;
    }> | null) || [];
    for (const n of unresolved) {
      const low = n.toLowerCase();
      const hit = catalog.find(c => {
        const nick = String(c.nickname || '').toLowerCase();
        const title = String(c.title || '').toLowerCase();
        return (
          (nick && (nick.includes(low) || low.includes(nick))) ||
          (title && (title.includes(low) || low.includes(title)))
        );
      });
      if (hit?.building_code) out.set(low, hit.building_code);
    }
  }

  return out;
}

// Resolve a listing nickname → building_code using the Guesty mirror.
// Used by aggregators that want to overlay the canonical building tag when
// email parsing produced only the listing name.
export async function lookupListingByNickname(
  nickname: string | null | undefined
): Promise<{ id: string; nickname: string; building_code: string | null; listing_type: string | null; master_listing_id: string | null } | null> {
  if (!nickname) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('guesty_listings')
    .select('id, nickname, building_code, listing_type, master_listing_id')
    .eq('nickname', nickname)
    .limit(1)
    .maybeSingle();
  return (data as {
    id: string;
    nickname: string;
    building_code: string | null;
    listing_type: string | null;
    master_listing_id: string | null;
  } | null) || null;
}

// Overlay authoritative fields on an email-parsed booking row. Returns a
// new object — doesn't mutate.
//
// Conflict policy (user rule 2026-04-21): Guesty wins on every field that
// both sides carry. Email-only fields pass through unchanged.
export function overlayGuestyOnBooking<
  T extends Record<string, unknown>
>(emailRow: T, guesty: GuestyReservationLite | null): T & {
  _guesty_matched: boolean;
  _guesty_overrides?: string[];
} {
  if (!guesty) return { ...emailRow, _guesty_matched: false };
  const overrides: string[] = [];

  const apply = <K extends keyof T>(
    key: K,
    source: unknown,
    emailKey: K = key
  ) => {
    if (source == null || source === '' || source === 0) return;
    const existing = emailRow[emailKey];
    if (existing !== source && existing != null) {
      overrides.push(String(emailKey));
    }
    (emailRow as Record<string, unknown>)[emailKey as string] = source;
  };

  // Known Beithady booking/payout shape — overlay if the caller uses these
  // common key names. Caller can also read guesty directly via the return.
  apply('guest_name', guesty.guest_name);
  apply('guest_email' as keyof T, guesty.guest_email);
  apply('listing_name', guesty.listing_nickname);
  apply('listing_nickname' as keyof T, guesty.listing_nickname);
  apply('check_in_date', guesty.check_in_date);
  apply('check_out_date', guesty.check_out_date);
  apply('nights', guesty.nights);
  apply('total_payout', guesty.host_payout);
  apply('host_payout' as keyof T, guesty.host_payout);
  apply('currency', guesty.currency);
  apply('channel', guesty.source);
  apply('source', guesty.source);
  apply('building_code', guesty.building_code);

  return {
    ...emailRow,
    _guesty_matched: true,
    _guesty_overrides: overrides.length > 0 ? overrides : undefined,
  };
}
