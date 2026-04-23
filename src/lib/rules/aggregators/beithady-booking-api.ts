// API-based Beithady booking aggregator. Replaces the email-parsing path
// in beithady-booking.ts — reads directly from the `guesty_reservations`
// mirror table (populated by src/lib/run-guesty-sync.ts).
//
// Returns the same BeithadyAggregateOutput shape as the email version so
// the /emails/beithady/[ruleId] page renders unchanged. Email-only audit
// fields (parse_errors, airbnb_*, missing_from_guesty, guesty_not_in_airbnb)
// are zeroed or emptied since they don't apply.

import { supabaseAdmin } from '@/lib/supabase';
import type {
  BeithadyAggregateOutput,
  BucketStat,
  EnrichedBooking,
} from './beithady-booking';
import { classifyBuilding } from './beithady-booking';

const round2 = (n: number) => Math.round(n * 100) / 100;

function bedroomsBucket(bedrooms: number | null): string {
  if (bedrooms == null) return 'Unknown';
  return `${bedrooms}BR`;
}

function incBucket(
  map: Map<string, BucketStat>,
  key: string,
  label: string,
  nights: number,
  payout: number
) {
  const existing = map.get(key);
  if (existing) {
    existing.reservation_count += 1;
    existing.nights += nights;
    existing.total_payout += payout;
  } else {
    map.set(key, {
      key,
      label,
      reservation_count: 1,
      nights,
      total_payout: payout,
    });
  }
}

function daysBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (24 * 3600 * 1000));
}

type ReservationRow = {
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
  guest_phone: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests: number | null;
  currency: string | null;
  host_payout: number | null;
  guest_paid: number | null;
  fare_accommodation: number | null;
  cleaning_fee: number | null;
  created_at_odoo: string | null; // Guesty createdAt
  listing: {
    nickname: string | null;
    title: string | null;
    building_code: string | null;
    bedrooms: number | null;
  } | null;
};

// Filter rules:
//  - match reservations whose Guesty createdAt falls inside [fromIso, toIso).
//    That mirrors the email-parsing behavior (emails arrive when the booking
//    is created).
//  - drop canceled reservations (status starts with 'cancel'). Email parsing
//    couldn't do this — the API does it properly.
export async function aggregateBeithadyBookingsFromApi(
  fromIso: string,
  toIso: string,
  currencyHint: string
): Promise<BeithadyAggregateOutput> {
  const sb = supabaseAdmin();

  // Pull reservations in the window. Page in batches of 1000 because Supabase
  // enforces a default row limit even when we don't ask for pagination.
  const rows: ReservationRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `id, confirmation_code, platform_confirmation_code, status, source,
         integration_platform, listing_id, listing_nickname, guest_name,
         guest_email, guest_phone, check_in_date, check_out_date, nights,
         guests, currency, host_payout, guest_paid, fare_accommodation,
         cleaning_fee, created_at_odoo,
         listing:guesty_listings!left(nickname, title, building_code, bedrooms)`
      )
      .gte('created_at_odoo', fromIso)
      .lt('created_at_odoo', toIso)
      .order('created_at_odoo', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`guesty_reservations_query_failed: ${error.message}`);
    const batch = (data as unknown as ReservationRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const bookings: EnrichedBooking[] = [];
  const channelMap = new Map<string, BucketStat>();
  const buildingMap = new Map<string, BucketStat>();
  const bedroomsMap = new Map<string, BucketStat>();
  const listingMap = new Map<string, BucketStat>();
  const uniqueGuests = new Set<string>();

  let totalPayout = 0;
  let totalGuestPaid = 0;
  let totalNights = 0;
  let totalGuests = 0;
  let totalRateSum = 0;
  let leadTimeSum = 0;
  let leadTimeSamples = 0;
  let currency = currencyHint;

  for (const r of rows) {
    // Match the semantics of the email parser, which only fired on Guesty
    // "New booking received" notifications — those are sent on state
    // transition to `confirmed`. Guesty lifecycle:
    //   inquiry (speculative hold, no money) ->
    //   reserved (accepted, awaiting payment) ->
    //   confirmed (real booking) ->
    //   (canceled | checked_in -> checked_out)
    // Drop anything that isn't a real confirmed/stayed reservation.
    const status = String(r.status || '').toLowerCase();
    const countable =
      status === 'confirmed' ||
      status === 'checked_in' ||
      status === 'checked_out';
    if (!countable) continue;

    const nights = r.nights ?? 0;
    const payout = Number(r.host_payout) || 0;
    const guestPaid = Number(r.guest_paid) || 0;
    const guests = r.guests ?? 0;
    const ratePerNight = nights > 0 ? payout / nights : 0;

    if (r.currency) currency = r.currency;
    totalPayout += payout;
    totalGuestPaid += guestPaid;
    totalNights += nights;
    totalGuests += guests;
    totalRateSum += ratePerNight;

    const guestName = (r.guest_name || '').trim();
    if (guestName) uniqueGuests.add(guestName.toLowerCase());

    // Lead time = check-in - booking createdAt
    const leadDays = daysBetween(
      r.created_at_odoo,
      r.check_in_date ? r.check_in_date + 'T00:00:00Z' : null
    );
    if (leadDays != null && leadDays >= 0 && leadDays < 365 * 2) {
      leadTimeSum += leadDays;
      leadTimeSamples += 1;
    }

    const channel = normalizeChannel(r.source, r.integration_platform);
    const listingNickname = r.listing?.nickname || r.listing_nickname || '';
    const listingTitle = r.listing?.title || listingNickname;
    const buildingCode =
      r.listing?.building_code || classifyBuilding(listingNickname) || 'UNKNOWN';
    const bedrooms = r.listing?.bedrooms ?? null;

    const enriched: EnrichedBooking = {
      booking_id: r.platform_confirmation_code || r.confirmation_code || r.id,
      channel,
      listing_name: listingTitle || listingNickname || 'Unknown',
      listing_code: listingNickname || '',
      guest_name: guestName || 'Unknown',
      guest_email: r.guest_email || null,
      guest_phone: r.guest_phone || null,
      check_in_date: r.check_in_date || '',
      check_out_date: r.check_out_date || '',
      nights,
      guests,
      guest_paid: round2(guestPaid),
      rate_per_night: round2(ratePerNight),
      total_payout: round2(payout),
      currency: r.currency || currencyHint,
      building_code: buildingCode,
      bedrooms,
    };
    bookings.push(enriched);

    incBucket(channelMap, channel, channel, nights, payout);
    incBucket(buildingMap, buildingCode, buildingCode, nights, payout);
    incBucket(
      bedroomsMap,
      bedroomsBucket(bedrooms),
      bedroomsBucket(bedrooms),
      nights,
      payout
    );
    const listingKey = listingNickname || listingTitle || 'Unknown';
    incBucket(listingMap, listingKey, listingKey, nights, payout);
  }

  const byChannel = Array.from(channelMap.values()).sort(
    (a, b) => b.reservation_count - a.reservation_count
  );
  const byBuilding = Array.from(buildingMap.values()).sort(
    (a, b) => b.reservation_count - a.reservation_count
  );
  const byBedrooms = Array.from(bedroomsMap.values()).sort((a, b) => {
    const na = parseInt(a.key.replace(/\D/g, ''), 10);
    const nb = parseInt(b.key.replace(/\D/g, ''), 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.key.localeCompare(b.key);
  });
  const byListing = Array.from(listingMap.values()).sort(
    (a, b) => b.reservation_count - a.reservation_count
  );

  const reservationCount = bookings.length;
  const avgNights = reservationCount ? totalNights / reservationCount : 0;
  const avgRate = reservationCount ? totalRateSum / reservationCount : 0;
  const avgPayout = reservationCount ? totalPayout / reservationCount : 0;
  const avgLeadTime = leadTimeSamples > 0 ? leadTimeSum / leadTimeSamples : null;

  const moneyRound = (values: BucketStat[]): BucketStat[] =>
    values.map(v => ({ ...v, total_payout: round2(v.total_payout) }));

  return {
    reservation_count: reservationCount,
    total_payout: round2(totalPayout),
    total_guest_paid: round2(totalGuestPaid),
    total_nights: totalNights,
    total_guests: totalGuests,
    avg_nights_per_booking: round2(avgNights),
    avg_rate_per_night: round2(avgRate),
    avg_payout_per_booking: round2(avgPayout),
    avg_lead_time_days:
      avgLeadTime != null ? Math.round(avgLeadTime * 10) / 10 : null,
    unique_guests: uniqueGuests.size,
    unique_listings: listingMap.size,
    unique_buildings: buildingMap.size,
    currency,
    by_channel: moneyRound(byChannel),
    by_building: moneyRound(byBuilding),
    by_bedrooms: moneyRound(byBedrooms),
    by_listing: moneyRound(byListing.slice(0, 50)),
    top_channel: byChannel[0] || null,
    top_building: byBuilding[0] || null,
    top_bedrooms:
      byBedrooms.slice().sort((a, b) => b.reservation_count - a.reservation_count)[0] ||
      null,
    top_listing: byListing[0] || null,
    bookings,
    // Email-only audit fields zeroed out — no parsing happens on the API path.
    parse_errors: 0,
    parse_failures: [],
    airbnb_emails_checked: 0,
    airbnb_confirmations_parsed: 0,
    airbnb_parse_errors: 0,
    airbnb_parse_failures: [],
    airbnb_matched_in_guesty: 0,
    missing_from_guesty: [],
    guesty_not_in_airbnb: 0,
    guesty_enriched_count: reservationCount, // every row IS Guesty now
  };
}

// Normalize Guesty channel to the channel names the email parser used so
// the UI's channel chips (Airbnb / Booking.com / Direct / Vrbo) keep their
// existing labels and colors.
function normalizeChannel(
  source: string | null,
  platform: string | null
): string {
  const raw = String(source || platform || '').trim().toLowerCase();
  if (!raw) return 'Direct';
  if (raw.includes('airbnb')) return 'Airbnb';
  if (raw.includes('booking')) return 'Booking.com';
  if (raw.includes('vrbo') || raw.includes('homeaway')) return 'Vrbo';
  if (raw.includes('agoda')) return 'Agoda';
  if (raw.includes('expedia')) return 'Expedia';
  if (raw === 'manual' || raw === 'direct' || raw.includes('direct')) return 'Direct';
  // Fallback: title-case the raw string
  return raw.replace(/\b\w/g, c => c.toUpperCase());
}
