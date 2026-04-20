import { anthropic, HAIKU } from '@/lib/anthropic';

export type ParsedBooking = {
  booking_id: string;
  channel: string;
  listing_name: string;
  listing_code: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  guests: number;
  guest_paid: number;
  rate_per_night: number;
  total_payout: number;
  currency: string;
};

export type EnrichedBooking = ParsedBooking & {
  building_code: string;
  bedrooms: number | null;
};

export type ParsedAirbnbConfirmation = {
  confirmation_code: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  listing_name: string | null;
  nights: number | null;
  guests: number | null;
  host_payout: number | null;
  currency: string | null;
};

export type ReconciliationMissing = {
  confirmation_code: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  listing_name: string | null;
  nights: number | null;
  host_payout: number | null;
};

export type BucketStat = {
  key: string;
  label: string;
  reservation_count: number;
  nights: number;
  total_payout: number;
};

export type BeithadyAggregateOutput = {
  reservation_count: number;
  total_payout: number;
  total_guest_paid: number;
  total_nights: number;
  total_guests: number;
  avg_nights_per_booking: number;
  avg_rate_per_night: number;
  avg_payout_per_booking: number;
  avg_lead_time_days: number | null;
  unique_guests: number;
  unique_listings: number;
  unique_buildings: number;
  currency: string;
  by_channel: BucketStat[];
  by_building: BucketStat[];
  by_bedrooms: BucketStat[];
  by_listing: BucketStat[];
  top_channel: BucketStat | null;
  top_building: BucketStat | null;
  top_bedrooms: BucketStat | null;
  top_listing: BucketStat | null;
  bookings: EnrichedBooking[];
  parse_errors: number;
  parse_failures: Array<{ subject: string; from: string; reason: string }>;
  airbnb_emails_checked: number;
  airbnb_confirmations_parsed: number;
  airbnb_parse_errors: number;
  airbnb_parse_failures: Array<{ subject: string; from: string; reason: string }>;
  airbnb_matched_in_guesty: number;
  missing_from_guesty: ReconciliationMissing[];
  guesty_not_in_airbnb: number;
};

const SYSTEM = `You parse Guesty booking-notification emails for Beithady (short-term rental operator) and extract structured reservation data. Emails have fields like Listing, Listing Code (e.g. BH73-3BR-SB-1-201), Guest Name, Check-in/out Date, Nights, Guests, Rate Per Night, Total Payout (after commission), Booking ID. Be strict: only extract values clearly present. If a field is missing or unreadable, omit the booking rather than guessing.`;

const TOOL = {
  name: 'extract_booking',
  description: 'Extract a Guesty/Beithady booking notification into structured fields.',
  input_schema: {
    type: 'object' as const,
    properties: {
      booking_id: {
        type: 'string',
        description: 'Booking reference id (e.g. HMN89AXARJ).',
      },
      channel: {
        type: 'string',
        description:
          'Booking channel / source (e.g. Airbnb, Booking.com, Direct, Vrbo). Usually in the subject "NEW BOOKING from X" or body "A New Booking Received from: X".',
      },
      listing_name: {
        type: 'string',
        description: 'Listing display name, e.g. "Luxury 3BR | 24/7 Front Desk & Security".',
      },
      listing_code: {
        type: 'string',
        description:
          'Short listing / unit code, e.g. "BH73-3BR-SB-1-201". The first dash-separated segment is the building code.',
      },
      guest_name: { type: 'string', description: 'Full guest name.' },
      guest_email: {
        type: ['string', 'null'],
        description: 'Guest email if present, else null.',
      },
      guest_phone: {
        type: ['string', 'null'],
        description: 'Guest phone if present, else null.',
      },
      check_in_date: {
        type: 'string',
        description:
          'Check-in date in ISO format YYYY-MM-DD. Convert phrases like "Apr 23rd, 2026" to "2026-04-23".',
      },
      check_out_date: {
        type: 'string',
        description: 'Check-out date in ISO format YYYY-MM-DD.',
      },
      nights: { type: 'number', description: 'Number of nights reserved.' },
      guests: { type: 'number', description: 'Number of guests on the reservation.' },
      guest_paid: {
        type: 'number',
        description: 'Amount the guest paid up-front as shown on the email (often 0 for OTAs).',
      },
      rate_per_night: {
        type: 'number',
        description: 'Nightly rate shown on the email.',
      },
      total_payout: {
        type: 'number',
        description:
          'Total payout to the host after commission (the "Total Payout (after commission)" line). Numeric only, no currency symbol.',
      },
      currency: {
        type: 'string',
        description:
          'ISO-like currency code. Default to USD if no symbol shown. Accept EGP, AED, SAR, EUR, etc. if clearly present.',
      },
    },
    required: [
      'booking_id',
      'channel',
      'listing_name',
      'listing_code',
      'guest_name',
      'check_in_date',
      'check_out_date',
      'nights',
      'guests',
      'rate_per_night',
      'total_payout',
      'currency',
    ],
  },
};

async function parseOne(
  subject: string,
  bodyText: string
): Promise<ParsedBooking | null> {
  const trimmedBody = bodyText.length > 12000 ? bodyText.slice(0, 12000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmedBody}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'extract_booking' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    booking_id: String(raw.booking_id || '').trim(),
    channel: String(raw.channel || 'Unknown').trim() || 'Unknown',
    listing_name: String(raw.listing_name || '').trim(),
    listing_code: String(raw.listing_code || '').trim(),
    guest_name: String(raw.guest_name || '').trim(),
    guest_email: raw.guest_email ? String(raw.guest_email) : null,
    guest_phone: raw.guest_phone ? String(raw.guest_phone) : null,
    check_in_date: String(raw.check_in_date || '').trim(),
    check_out_date: String(raw.check_out_date || '').trim(),
    nights: Number(raw.nights) || 0,
    guests: Number(raw.guests) || 0,
    guest_paid: Number(raw.guest_paid) || 0,
    rate_per_night: Number(raw.rate_per_night) || 0,
    total_payout: Number(raw.total_payout) || 0,
    currency: String(raw.currency || 'USD').trim() || 'USD',
  };
}

const AIRBNB_SYSTEM = `You parse Airbnb reservation-confirmation emails that Airbnb sends to a Guesty inbox (guesty@beithady.com), which are then relayed through Guesty's mail service. The visible From is usually "service via Guesty" and the subject is of the form "Reservation confirmed - <Guest Name> arrives <Date>". The email body is Airbnb's standard reservation template with footer "Airbnb Ireland UC, 25 North Wall Quay, Dublin". Extract: the Airbnb confirmation code (starts with HM, alphanumeric, ~10 chars — look for it in the body or a View details link), guest name (from subject or body), check-in/out dates, listing name, number of nights/guests, and host payout / earnings if shown. Be strict: only extract values clearly present. If the email is not a reservation confirmation (e.g. alteration, cancellation, review request, payout-only notification), return null by omitting the tool call.`;

const AIRBNB_TOOL = {
  name: 'extract_airbnb_confirmation',
  description: 'Extract fields from an Airbnb reservation-confirmation email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      confirmation_code: {
        type: 'string',
        description:
          'Airbnb confirmation/reservation code — starts with HM and is alphanumeric. Also known as the booking code.',
      },
      guest_name: {
        type: 'string',
        description: 'Full name of the guest who booked.',
      },
      check_in_date: {
        type: 'string',
        description: 'Check-in date in ISO YYYY-MM-DD.',
      },
      check_out_date: {
        type: 'string',
        description: 'Check-out date in ISO YYYY-MM-DD.',
      },
      listing_name: {
        type: ['string', 'null'],
        description: 'Name of the listing the booking was made on, if shown.',
      },
      nights: {
        type: ['number', 'null'],
        description: 'Number of nights if shown.',
      },
      guests: {
        type: ['number', 'null'],
        description: 'Number of guests if shown.',
      },
      host_payout: {
        type: ['number', 'null'],
        description: 'Host payout amount if shown. Numeric only, no currency symbol.',
      },
      currency: {
        type: ['string', 'null'],
        description: 'Currency code if shown (USD, EUR, etc).',
      },
    },
    required: ['confirmation_code', 'guest_name', 'check_in_date', 'check_out_date'],
  },
};

async function parseAirbnbConfirmation(
  subject: string,
  bodyText: string
): Promise<ParsedAirbnbConfirmation | null> {
  const trimmedBody = bodyText.length > 12000 ? bodyText.slice(0, 12000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmedBody}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: [
      { type: 'text', text: AIRBNB_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [AIRBNB_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  const code = String(raw.confirmation_code || '').trim().toUpperCase();
  if (!code) return null;
  return {
    confirmation_code: code,
    guest_name: String(raw.guest_name || '').trim(),
    check_in_date: String(raw.check_in_date || '').trim(),
    check_out_date: String(raw.check_out_date || '').trim(),
    listing_name: raw.listing_name ? String(raw.listing_name) : null,
    nights: raw.nights != null ? Number(raw.nights) : null,
    guests: raw.guests != null ? Number(raw.guests) : null,
    host_payout: raw.host_payout != null ? Number(raw.host_payout) : null,
    currency: raw.currency ? String(raw.currency).trim() || null : null,
  };
}

export const BEITHADY_BUILDINGS: Record<
  string,
  { label: string; description?: string }
> = {
  'BH-26': { label: 'BH-26' },
  'BH-73': { label: 'BH-73' },
  'BH-435': { label: 'BH-435' },
  'BH-OK': {
    label: 'BH-OK',
    description: 'Scattered apartments · One Kattameya compound',
  },
  'BH-MG': {
    label: 'BH-MG',
    description: 'Single apartment · Heliopolis',
  },
};

function deriveBuildingCode(listingCode: string): string {
  const first = (listingCode || '').split('-')[0]?.trim().toUpperCase();
  if (!first) return 'UNKNOWN';
  const m = first.match(/^BH([A-Z0-9]+)$/);
  return m ? `BH-${m[1]}` : first;
}

function deriveBedrooms(listingCode: string, listingName: string): number | null {
  const sources = [listingCode, listingName];
  for (const s of sources) {
    const m = s?.match(/(\d+)\s*BR/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function bucketKey(bedrooms: number | null): string {
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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (24 * 3600 * 1000));
}

export async function aggregateBeithadyBookings(
  bodies: Array<{ subject: string; from: string; bodyText: string }>,
  currencyHint: string,
  airbnbBodies: Array<{ subject: string; from: string; bodyText: string }> = [],
  receivedAtByIndex?: Array<string | null>
): Promise<BeithadyAggregateOutput> {
  const parsed: EnrichedBooking[] = [];
  const parsedReceivedAt: Array<string | null> = [];
  let parseErrors = 0;
  const parseFailures: Array<{ subject: string; from: string; reason: string }> = [];

  const results = await Promise.allSettled(
    bodies.map(b => parseOne(b.subject, b.bodyText))
  );

  const seenBookingIds = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const src = bodies[i];
    if (r.status === 'fulfilled' && r.value && r.value.booking_id) {
      if (seenBookingIds.has(r.value.booking_id)) continue;
      seenBookingIds.add(r.value.booking_id);
      const enriched: EnrichedBooking = {
        ...r.value,
        building_code: deriveBuildingCode(r.value.listing_code),
        bedrooms: deriveBedrooms(r.value.listing_code, r.value.listing_name),
      };
      parsed.push(enriched);
      parsedReceivedAt.push(receivedAtByIndex?.[i] ?? null);
    } else {
      parseErrors++;
      const reason =
        r.status === 'rejected'
          ? String(
              (r as PromiseRejectedResult).reason?.message ||
                (r as PromiseRejectedResult).reason ||
                'rejected'
            )
          : r.status === 'fulfilled' && !r.value?.booking_id
            ? 'missing_booking_id'
            : 'no_tool_output';
      parseFailures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: reason.slice(0, 300),
      });
    }
  }

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

  for (let i = 0; i < parsed.length; i++) {
    const b = parsed[i];
    if (b.currency) currency = b.currency;
    totalPayout += b.total_payout || 0;
    totalGuestPaid += b.guest_paid || 0;
    totalNights += b.nights || 0;
    totalGuests += b.guests || 0;
    totalRateSum += b.rate_per_night || 0;
    if (b.guest_name) uniqueGuests.add(b.guest_name.trim().toLowerCase());

    const receivedIso = parsedReceivedAt[i] || null;
    if (receivedIso && b.check_in_date) {
      const lt = daysBetween(receivedIso, b.check_in_date + 'T00:00:00Z');
      if (lt != null && lt >= 0 && lt < 365 * 2) {
        leadTimeSum += lt;
        leadTimeSamples += 1;
      }
    }

    incBucket(channelMap, b.channel || 'Unknown', b.channel || 'Unknown', b.nights, b.total_payout);
    incBucket(
      buildingMap,
      b.building_code,
      b.building_code,
      b.nights,
      b.total_payout
    );
    incBucket(
      bedroomsMap,
      bucketKey(b.bedrooms),
      bucketKey(b.bedrooms),
      b.nights,
      b.total_payout
    );
    incBucket(
      listingMap,
      b.listing_code || b.listing_name || 'Unknown',
      b.listing_code || b.listing_name || 'Unknown',
      b.nights,
      b.total_payout
    );
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

  const reservationCount = parsed.length;
  const avgNights = reservationCount ? totalNights / reservationCount : 0;
  const avgRate = reservationCount ? totalRateSum / reservationCount : 0;
  const avgPayout = reservationCount ? totalPayout / reservationCount : 0;
  const avgLeadTime = leadTimeSamples > 0 ? leadTimeSum / leadTimeSamples : null;

  const moneyRound = (values: BucketStat[]): BucketStat[] =>
    values.map(v => ({ ...v, total_payout: roundMoney(v.total_payout) }));

  // Airbnb reservation-confirmation reconciliation
  const airbnbResults = await Promise.allSettled(
    airbnbBodies.map(b => parseAirbnbConfirmation(b.subject, b.bodyText))
  );
  const airbnbParsed: ParsedAirbnbConfirmation[] = [];
  const airbnbFailures: Array<{ subject: string; from: string; reason: string }> = [];
  let airbnbParseErrors = 0;
  const seenAirbnbCodes = new Set<string>();
  for (let i = 0; i < airbnbResults.length; i++) {
    const r = airbnbResults[i];
    const src = airbnbBodies[i];
    if (r.status === 'fulfilled' && r.value && r.value.confirmation_code) {
      if (seenAirbnbCodes.has(r.value.confirmation_code)) continue;
      seenAirbnbCodes.add(r.value.confirmation_code);
      airbnbParsed.push(r.value);
    } else if (r.status === 'rejected') {
      airbnbParseErrors++;
      airbnbFailures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: String(
          (r as PromiseRejectedResult).reason?.message ||
            (r as PromiseRejectedResult).reason ||
            'rejected'
        ).slice(0, 300),
      });
    }
    // fulfilled-but-null is silent — normal for non-confirmation Airbnb emails
  }

  const guestyCodes = new Set(
    parsed
      .map(b => (b.booking_id || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const airbnbCodes = new Set(
    airbnbParsed.map(a => a.confirmation_code.toUpperCase())
  );

  const missingFromGuesty: ReconciliationMissing[] = airbnbParsed
    .filter(a => !guestyCodes.has(a.confirmation_code))
    .map(a => ({
      confirmation_code: a.confirmation_code,
      guest_name: a.guest_name,
      check_in_date: a.check_in_date,
      check_out_date: a.check_out_date,
      listing_name: a.listing_name,
      nights: a.nights,
      host_payout: a.host_payout != null ? roundMoney(a.host_payout) : null,
    }));

  const airbnbMatched = airbnbParsed.filter(a =>
    guestyCodes.has(a.confirmation_code)
  ).length;

  // Bookings in Guesty that came from Airbnb channel but weren't found
  // in the Airbnb direct emails (useful signal: delivery delay on Airbnb's side
  // or the Airbnb direct notification was filtered out of the mailbox).
  const guestyNotInAirbnb = parsed.filter(
    b =>
      (b.channel || '').toLowerCase().includes('airbnb') &&
      !airbnbCodes.has((b.booking_id || '').toUpperCase())
  ).length;

  return {
    reservation_count: reservationCount,
    total_payout: roundMoney(totalPayout),
    total_guest_paid: roundMoney(totalGuestPaid),
    total_nights: totalNights,
    total_guests: totalGuests,
    avg_nights_per_booking: Math.round(avgNights * 100) / 100,
    avg_rate_per_night: roundMoney(avgRate),
    avg_payout_per_booking: roundMoney(avgPayout),
    avg_lead_time_days: avgLeadTime != null ? Math.round(avgLeadTime * 10) / 10 : null,
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
    top_bedrooms: byBedrooms.slice().sort((a, b) => b.reservation_count - a.reservation_count)[0] || null,
    top_listing: byListing[0] || null,
    bookings: parsed.map(b => ({
      ...b,
      total_payout: roundMoney(b.total_payout),
      guest_paid: roundMoney(b.guest_paid),
      rate_per_night: roundMoney(b.rate_per_night),
    })),
    parse_errors: parseErrors,
    parse_failures: parseFailures,
    airbnb_emails_checked: airbnbBodies.length,
    airbnb_confirmations_parsed: airbnbParsed.length,
    airbnb_parse_errors: airbnbParseErrors,
    airbnb_parse_failures: airbnbFailures,
    airbnb_matched_in_guesty: airbnbMatched,
    missing_from_guesty: missingFromGuesty,
    guesty_not_in_airbnb: guestyNotInAirbnb,
  };
}
