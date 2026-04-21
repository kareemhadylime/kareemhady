import { anthropic, HAIKU } from '@/lib/anthropic';
import { classifyBuilding } from './beithady-booking';
import { buildingFromListingName } from '../beithady-listings';

export type ParsedAirbnbInquiry = {
  guest_name: string;
  guest_question: string | null;
  listing_name: string | null;
  stay_start: string | null;
  stay_end: string | null;
  num_adults: number | null;
  num_children: number | null;
  num_infants: number | null;
};

export type InquiryCategory =
  | 'location_info'
  | 'amenity'
  | 'pricing'
  | 'booking_logistics'
  | 'availability'
  | 'group_question'
  | 'other';

export type InquiryClassification = {
  category: InquiryCategory;
  summary: string;
  needs_manual_attention: boolean;
};

export type InquiryGuestGroup = {
  guest_name: string;
  inquiry_count: number;
  latest_received_iso: string | null;
  categories: InquiryCategory[];
  listings: string[];
  has_manual_attention: boolean;
};

export type InquiryCategoryBucket = {
  key: InquiryCategory;
  count: number;
};

export type InquiryBuildingBucket = {
  key: string;
  count: number;
};

export type StoredInquiry = ParsedAirbnbInquiry & {
  received_iso: string | null;
  building_code: string | null;
  classification: InquiryClassification | null;
};

export type BeithadyInquiryAggregate = {
  email_count: number;
  parse_errors: number;
  parse_failures: Array<{ subject: string; from: string; reason: string }>;
  total_inquiries: number;
  unique_guests: number;
  manual_attention_count: number;
  classification_errors: number;
  by_category: InquiryCategoryBucket[];
  by_building: InquiryBuildingBucket[];
  by_guest: InquiryGuestGroup[];
  inquiries: StoredInquiry[];
  guesty_enriched_count?: number;
};

const INQUIRY_SYSTEM = `You parse Airbnb inquiry-notification emails relayed through Guesty to guesty@beithady.com.

Typical shape:
  Subject: "Inquiry for Luxury 3BR | 24/7 Front Desk & Security for Apr 23 - 27, 2026"
  From: "service via Guesty"
  Body has a "Respond to <Guest>'s inquiry" header, the guest name + "Identity verified · N reviews" line, then the guest's actual question (e.g. "What is the name of the compound please?"), a "Pre-approve / Decline" button, a photo of the listing, then Guests count ("3 adults, 3 children"), then "You have 24 hours to respond", then the listing card (name + "Entire home/apt") with check-in and check-out dates/times.

Rules:
- guest_name: from subject or "Respond to X's inquiry" — just the first name/full name as given.
- guest_question: the actual question text from the guest, 1-2 sentences, copied verbatim. Strip greeting/signoff if any. Null if no question body is embedded (some inquiry emails are just "X wants to book" with no question).
- listing_name: the listing title shown in the reservation card (e.g. "Luxury 3BR | 24/7 Front Desk & Security"). Strip any date suffix.
- stay_start / stay_end: ISO YYYY-MM-DD. The subject has "for Apr 23 - 27, 2026" as a reliable source; the body also has check-in / check-out. Use whichever is unambiguous.
- num_adults / num_children / num_infants: integers parsed from "3 adults, 3 children" style. Null if absent for that field.
- If the email is NOT a guest inquiry (e.g. "Inquiry marked as spam", digest / marketing, outbound alteration-request emails TO a guest), omit the tool call entirely.`;

const INQUIRY_TOOL = {
  name: 'extract_airbnb_inquiry',
  description: 'Parse an Airbnb guest-inquiry notification email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      guest_name: { type: 'string' },
      guest_question: { type: ['string', 'null'] },
      listing_name: { type: ['string', 'null'] },
      stay_start: { type: ['string', 'null'] },
      stay_end: { type: ['string', 'null'] },
      num_adults: { type: ['number', 'null'] },
      num_children: { type: ['number', 'null'] },
      num_infants: { type: ['number', 'null'] },
    },
    required: ['guest_name'],
  },
};

const CLASSIFY_SYSTEM = `You classify a short-term-rental guest inquiry into a fixed category and write a 1-sentence summary for the host's dashboard.

Categories (pick exactly ONE best fit):
- location_info: directions, neighborhood questions, compound name, which building, how to find it, nearby landmarks
- amenity: what's provided (wifi speed, pool hours, kitchen equipment, gym, parking availability as a feature)
- pricing: rate questions, discount requests, negotiation, long-stay rate
- booking_logistics: check-in time, late arrival, luggage storage, early check-in, late check-out, key handover
- availability: can they book these dates, is it still available, alternate date suggestions
- group_question: pet policy, larger group, events, accessibility, children under specific age
- other: anything else

needs_manual_attention = true when the question requires a host decision (custom price, policy exception, pet request, unusual need) rather than information already in the listing. Standard factual questions = false.

summary: one short sentence paraphrasing what the guest is asking. 12 words max. No emojis.`;

const CLASSIFY_TOOL = {
  name: 'classify_inquiry',
  description: 'Classify a guest inquiry for the host dashboard.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: [
          'location_info',
          'amenity',
          'pricing',
          'booking_logistics',
          'availability',
          'group_question',
          'other',
        ],
      },
      summary: { type: 'string' },
      needs_manual_attention: { type: 'boolean' },
    },
    required: ['category', 'summary', 'needs_manual_attention'],
  },
};

async function parseAirbnbInquiry(
  subject: string,
  bodyText: string
): Promise<ParsedAirbnbInquiry | null> {
  const trimmed = bodyText.length > 12000 ? bodyText.slice(0, 12000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmed}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 900,
    system: [
      { type: 'text', text: INQUIRY_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [INQUIRY_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  const name = String(raw.guest_name || '').trim();
  if (!name) return null;
  return {
    guest_name: name,
    guest_question: raw.guest_question ? String(raw.guest_question).trim() : null,
    listing_name: raw.listing_name ? String(raw.listing_name).trim() : null,
    stay_start: raw.stay_start ? String(raw.stay_start) : null,
    stay_end: raw.stay_end ? String(raw.stay_end) : null,
    num_adults: raw.num_adults != null ? Number(raw.num_adults) : null,
    num_children: raw.num_children != null ? Number(raw.num_children) : null,
    num_infants: raw.num_infants != null ? Number(raw.num_infants) : null,
  };
}

async function classifyInquiry(
  inquiry: ParsedAirbnbInquiry
): Promise<InquiryClassification | null> {
  const content = [
    `LISTING: ${inquiry.listing_name || 'unknown'}`,
    `STAY: ${inquiry.stay_start || '?'} → ${inquiry.stay_end || '?'}`,
    `PARTY: ${[
      inquiry.num_adults != null ? `${inquiry.num_adults} adults` : null,
      inquiry.num_children != null ? `${inquiry.num_children} children` : null,
      inquiry.num_infants != null ? `${inquiry.num_infants} infants` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'unknown'}`,
    `QUESTION: ${inquiry.guest_question || '(none embedded — treat as "wants to book" availability check)'}`,
  ].join('\n');
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 400,
    system: [
      { type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_inquiry' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    category: String(raw.category || 'other') as InquiryCategory,
    summary: String(raw.summary || '').trim(),
    needs_manual_attention: Boolean(raw.needs_manual_attention),
  };
}

function buildingFromListing(listing: string | null | undefined): string | null {
  if (!listing) return null;
  const catalog = buildingFromListingName(listing);
  if (catalog) return catalog;
  const m = listing.match(/\bBH[-\s]?[A-Z0-9]+\b/i);
  if (m) return classifyBuilding(m[0].replace(/\s+/g, ''));
  const lower = listing.toLowerCase();
  if (lower.includes('ednc') || lower.includes('new cairo') || lower.includes('kattameya'))
    return 'BH-OK';
  if (lower.includes('heliopolis') || lower.includes('merghany')) return 'BH-MG';
  return null;
}

export async function aggregateBeithadyInquiries(
  bodies: Array<{
    subject: string;
    from: string;
    bodyText: string;
    receivedIso: string | null;
  }>
): Promise<BeithadyInquiryAggregate> {
  const settled = await Promise.allSettled(
    bodies.map(b => parseAirbnbInquiry(b.subject, b.bodyText))
  );

  type ParsedEntry = { parsed: ParsedAirbnbInquiry; receivedIso: string | null };
  const parsed: ParsedEntry[] = [];
  const failures: BeithadyInquiryAggregate['parse_failures'] = [];
  let parseErrors = 0;

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const src = bodies[i];
    if (r.status === 'fulfilled' && r.value) {
      parsed.push({ parsed: r.value, receivedIso: src.receivedIso });
    } else if (r.status === 'rejected') {
      parseErrors++;
      failures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: String(
          (r as PromiseRejectedResult).reason?.message ||
            (r as PromiseRejectedResult).reason ||
            'rejected'
        ).slice(0, 300),
      });
    }
  }

  const classified = await Promise.allSettled(
    parsed.map(p => classifyInquiry(p.parsed))
  );
  let classificationErrors = 0;

  // Resolve listing_name → canonical building_code via Guesty mirror.
  let listingNameToBuilding = new Map<string, string>();
  let inquiryEnrichedCount = 0;
  try {
    const { batchLookupBuildingsByListingName } = await import(
      '@/lib/guesty-enrichment'
    );
    listingNameToBuilding = await batchLookupBuildingsByListingName(
      parsed.map(p => p.parsed.listing_name)
    );
  } catch {
    // skip
  }

  const inquiries: StoredInquiry[] = parsed.map((p, i) => {
    const r = classified[i];
    let cls: InquiryClassification | null = null;
    if (r.status === 'fulfilled') cls = r.value;
    else classificationErrors++;
    const guestyBuilding = listingNameToBuilding.get(
      String(p.parsed.listing_name || '').toLowerCase()
    );
    if (guestyBuilding) inquiryEnrichedCount++;
    return {
      ...p.parsed,
      received_iso: p.receivedIso,
      building_code: guestyBuilding || buildingFromListing(p.parsed.listing_name),
      classification: cls,
    };
  });

  const categoryMap = new Map<InquiryCategory, number>();
  const buildingMap = new Map<string, number>();
  const guestMap = new Map<
    string,
    {
      inquiry_count: number;
      latest_received_iso: string | null;
      categories: Set<InquiryCategory>;
      listings: Set<string>;
      has_manual_attention: boolean;
    }
  >();
  let manualAttention = 0;

  for (const inq of inquiries) {
    const bKey = inq.building_code || 'UNKNOWN';
    buildingMap.set(bKey, (buildingMap.get(bKey) || 0) + 1);

    if (inq.classification) {
      const c = inq.classification.category;
      categoryMap.set(c, (categoryMap.get(c) || 0) + 1);
      if (inq.classification.needs_manual_attention) manualAttention++;
    }

    const gKey = inq.guest_name || 'Unknown';
    const existing = guestMap.get(gKey);
    if (existing) {
      existing.inquiry_count += 1;
      if (
        inq.received_iso &&
        (!existing.latest_received_iso ||
          new Date(inq.received_iso) > new Date(existing.latest_received_iso))
      ) {
        existing.latest_received_iso = inq.received_iso;
      }
      if (inq.classification) existing.categories.add(inq.classification.category);
      if (inq.listing_name) existing.listings.add(inq.listing_name);
      if (inq.classification?.needs_manual_attention)
        existing.has_manual_attention = true;
    } else {
      guestMap.set(gKey, {
        inquiry_count: 1,
        latest_received_iso: inq.received_iso,
        categories: new Set(inq.classification ? [inq.classification.category] : []),
        listings: new Set(inq.listing_name ? [inq.listing_name] : []),
        has_manual_attention: !!inq.classification?.needs_manual_attention,
      });
    }
  }

  const byCategory: InquiryCategoryBucket[] = Array.from(categoryMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const byBuilding: InquiryBuildingBucket[] = Array.from(buildingMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const byGuest: InquiryGuestGroup[] = Array.from(guestMap.entries())
    .map(([guest_name, v]) => ({
      guest_name,
      inquiry_count: v.inquiry_count,
      latest_received_iso: v.latest_received_iso,
      categories: Array.from(v.categories),
      listings: Array.from(v.listings).slice(0, 3),
      has_manual_attention: v.has_manual_attention,
    }))
    .sort((a, b) => {
      if (a.has_manual_attention !== b.has_manual_attention)
        return a.has_manual_attention ? -1 : 1;
      if (b.inquiry_count !== a.inquiry_count)
        return b.inquiry_count - a.inquiry_count;
      const aT = a.latest_received_iso ? new Date(a.latest_received_iso).getTime() : 0;
      const bT = b.latest_received_iso ? new Date(b.latest_received_iso).getTime() : 0;
      return bT - aT;
    });

  return {
    email_count: bodies.length,
    parse_errors: parseErrors,
    parse_failures: failures,
    total_inquiries: parsed.length,
    unique_guests: guestMap.size,
    manual_attention_count: manualAttention,
    classification_errors: classificationErrors,
    by_category: byCategory,
    by_building: byBuilding,
    by_guest: byGuest,
    inquiries,
    guesty_enriched_count: inquiryEnrichedCount,
  };
}
