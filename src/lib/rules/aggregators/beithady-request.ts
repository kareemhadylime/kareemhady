import { anthropic, HAIKU } from '@/lib/anthropic';
import { classifyBuilding } from './beithady-booking';

export type ParsedGuestMessage = {
  guest_name: string;
  listing_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  num_adults: number | null;
  num_children: number | null;
  num_infants: number | null;
  message_text: string | null;
  has_image: boolean;
  message_count_in_thread: number;
};

export type RequestCategory =
  | 'date_change'
  | 'amenity_request'
  | 'immediate_complaint'
  | 'refund_dispute'
  | 'check_in_help'
  | 'general_question'
  | 'other';

export type RequestUrgency = 'immediate' | 'high' | 'normal';

export type RequestClassification = {
  category: RequestCategory;
  urgency: RequestUrgency;
  summary: string;
  suggested_action: string;
};

export type StoredMessage = ParsedGuestMessage & {
  received_iso: string | null;
  subject: string;
  group_key: string;
  building_code: string | null;
  classification: RequestClassification | null;
};

export type RequestReservationGroup = {
  group_key: string;
  guest_name: string;
  listing_name: string | null;
  building_code: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  message_count: number;
  categories: RequestCategory[];
  max_urgency: RequestUrgency;
  has_immediate_complaint: boolean;
  latest_received_iso: string | null;
  latest_summary: string | null;
  latest_suggested_action: string | null;
};

export type RequestCategoryBucket = {
  key: RequestCategory;
  count: number;
};

export type BeithadyRequestAggregate = {
  email_count: number;
  parse_errors: number;
  parse_failures: Array<{ subject: string; from: string; reason: string }>;
  total_messages: number;
  unique_reservations: number;
  immediate_count: number;
  classification_errors: number;
  by_category: RequestCategoryBucket[];
  by_reservation: RequestReservationGroup[];
  messages: StoredMessage[];
};

const MESSAGE_SYSTEM = `You parse Airbnb reservation-message emails relayed through Guesty to guesty@beithady.com. These are emails where a guest WITH AN EXISTING RESERVATION has sent a message to the host.

Typical shape:
  Subject: "RE: Reservation for <Listing name>, <Date range>" (the RE: prefix indicates a reply in an ongoing reservation thread)
  From: "service via Guesty"
  Body begins: "For your protection and safety, always communicate through Airbnb."
  Then ONE OR MORE message bubbles, each with a sender name (e.g. "Adel"), a role label (usually "Booker" for the guest), and either a text body or "Image sent" if the guest sent a photo. Messages may be in English or Arabic.
  Then a "Reply" button, then the listing card with listing name, "Rental unit - Entire home/apt hosted by Beit Hady Hospitality", Check-in (weekday + full date + time), Checkout (weekday + full date + time), and Guests count.

Rules:
- guest_name: the Booker's name shown in the message bubbles (e.g. "Adel"). If multiple, take the first (topmost) Booker bubble.
- listing_name: from the reservation card, strip hosting line and date suffix.
- check_in_date / check_out_date: parse dates from the "Check-in Friday April 24, 2026 3:00 PM" / "Checkout Wednesday April 29, 2026 11:00 AM" blocks. Output ISO YYYY-MM-DD, no time.
- num_adults / num_children / num_infants: integers from "Guests: 2 adults, 2 children". Null for any field not present.
- message_text: the NEWEST guest message content — copy verbatim (preserve Arabic if Arabic). Multiple consecutive short bubbles from the same guest can be concatenated with newlines. Strip Airbnb boilerplate ("always communicate through Airbnb", image-only bubbles, footer addresses). Return null if the email has no guest-written text (e.g. only "Image sent" with no text bubble at all).
- has_image: true if any "Image sent" bubble appears.
- message_count_in_thread: count of distinct message bubbles (guest or host) visible in the email, capped at 20. Rough estimate is fine.
- If the email is NOT a guest-reservation-message (e.g. outbound alteration proposal sent BY host, reservation cancellation notice, review reminder, booking confirmation with no guest message body), omit the tool call entirely.`;

const MESSAGE_TOOL = {
  name: 'extract_reservation_message',
  description: 'Parse an Airbnb reservation-reply email with guest messages.',
  input_schema: {
    type: 'object' as const,
    properties: {
      guest_name: { type: 'string' },
      listing_name: { type: ['string', 'null'] },
      check_in_date: { type: ['string', 'null'] },
      check_out_date: { type: ['string', 'null'] },
      num_adults: { type: ['number', 'null'] },
      num_children: { type: ['number', 'null'] },
      num_infants: { type: ['number', 'null'] },
      message_text: { type: ['string', 'null'] },
      has_image: { type: 'boolean' },
      message_count_in_thread: { type: 'number' },
    },
    required: ['guest_name', 'has_image', 'message_count_in_thread'],
  },
};

const CLASSIFY_SYSTEM = `You classify a short-term-rental guest's reservation message into a fixed category + urgency so the host can triage during/around a stay.

Categories (pick exactly ONE best fit):
- date_change: reschedule, extend, shorten, early-check-in or late-check-out date questions, alteration requests
- amenity_request: needs extra towels, missing item, broken-but-not-urgent appliance, request for a cot/bed, wifi info during stay
- immediate_complaint: something is wrong RIGHT NOW during a stay — no hot water, no AC, no water, security concern, noise, can't enter, broken lock
- refund_dispute: price complaint, no-refund policy push-back, claim of being overcharged, threatening a chargeback or negative review over money
- check_in_help: arriving now and can't find place, door code problem, key issue, late arrival coordination, directions on arrival day
- general_question: any pre-arrival or post-arrival info question that doesn't fit above
- other: anything else

Urgency:
- immediate: needs host intervention within hours (no hot water, can't enter, security, refund dispute escalating, arriving today)
- high: needs host action today but not in next hour (extra towels, minor malfunction, date-change proposal with a deadline)
- normal: informational or slow-moving (general question, polite request with no time pressure)

summary: 1-2 short sentences in ENGLISH (translate from Arabic if needed), capturing the guest's actual ask/complaint. No boilerplate. No emojis.

suggested_action: ONE concrete next action for the host / front-desk team. Imperative. e.g. "Dispatch maintenance to unit to check AC within 1 hour" or "Open a date-change proposal in Airbnb for Apr 26-30 and message guest to confirm."`;

const CLASSIFY_TOOL = {
  name: 'classify_reservation_message',
  description: 'Classify a guest reservation message into category + urgency.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: [
          'date_change',
          'amenity_request',
          'immediate_complaint',
          'refund_dispute',
          'check_in_help',
          'general_question',
          'other',
        ],
      },
      urgency: { type: 'string', enum: ['immediate', 'high', 'normal'] },
      summary: { type: 'string' },
      suggested_action: { type: 'string' },
    },
    required: ['category', 'urgency', 'summary', 'suggested_action'],
  },
};

async function parseGuestMessage(
  subject: string,
  bodyText: string
): Promise<ParsedGuestMessage | null> {
  const trimmed = bodyText.length > 14000 ? bodyText.slice(0, 14000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmed}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 1200,
    system: [
      { type: 'text', text: MESSAGE_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [MESSAGE_TOOL],
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
    listing_name: raw.listing_name ? String(raw.listing_name).trim() : null,
    check_in_date: raw.check_in_date ? String(raw.check_in_date) : null,
    check_out_date: raw.check_out_date ? String(raw.check_out_date) : null,
    num_adults: raw.num_adults != null ? Number(raw.num_adults) : null,
    num_children: raw.num_children != null ? Number(raw.num_children) : null,
    num_infants: raw.num_infants != null ? Number(raw.num_infants) : null,
    message_text: raw.message_text ? String(raw.message_text).trim() : null,
    has_image: Boolean(raw.has_image),
    message_count_in_thread:
      Math.max(0, Math.min(20, Math.round(Number(raw.message_count_in_thread) || 0))) || 1,
  };
}

async function classifyMessage(
  msg: ParsedGuestMessage
): Promise<RequestClassification | null> {
  const hasText = !!msg.message_text;
  const content = [
    `LISTING: ${msg.listing_name || 'unknown'}`,
    `STAY: ${msg.check_in_date || '?'} → ${msg.check_out_date || '?'}`,
    `PARTY: ${[
      msg.num_adults != null ? `${msg.num_adults} adults` : null,
      msg.num_children != null ? `${msg.num_children} children` : null,
      msg.num_infants != null ? `${msg.num_infants} infants` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'unknown'}`,
    `THREAD DEPTH: ${msg.message_count_in_thread} message(s)`,
    `IMAGE SENT: ${msg.has_image ? 'yes' : 'no'}`,
    `GUEST MESSAGE: ${hasText ? msg.message_text : '(no text body — guest only sent an image, or message was empty)'}`,
  ].join('\n');
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 500,
    system: [
      { type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_reservation_message' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    category: String(raw.category || 'other') as RequestCategory,
    urgency: String(raw.urgency || 'normal') as RequestUrgency,
    summary: String(raw.summary || '').trim(),
    suggested_action: String(raw.suggested_action || '').trim(),
  };
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^((re|fw|fwd):\s*)+/gi, '')
    .trim()
    .toLowerCase();
}

function buildingFromListing(listing: string | null | undefined): string | null {
  if (!listing) return null;
  const m = listing.match(/\bBH[-\s]?[A-Z0-9]+\b/i);
  if (m) return classifyBuilding(m[0].replace(/\s+/g, ''));
  const lower = listing.toLowerCase();
  if (lower.includes('ednc') || lower.includes('new cairo') || lower.includes('kattameya'))
    return 'BH-OK';
  if (lower.includes('heliopolis') || lower.includes('merghany')) return 'BH-MG';
  return null;
}

const URGENCY_RANK: Record<RequestUrgency, number> = {
  immediate: 3,
  high: 2,
  normal: 1,
};

export async function aggregateBeithadyRequests(
  bodies: Array<{
    subject: string;
    from: string;
    bodyText: string;
    receivedIso: string | null;
  }>
): Promise<BeithadyRequestAggregate> {
  const settled = await Promise.allSettled(
    bodies.map(b => parseGuestMessage(b.subject, b.bodyText))
  );

  type ParsedEntry = {
    parsed: ParsedGuestMessage;
    src: (typeof bodies)[number];
  };
  const parsed: ParsedEntry[] = [];
  const failures: BeithadyRequestAggregate['parse_failures'] = [];
  let parseErrors = 0;

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const src = bodies[i];
    if (r.status === 'fulfilled' && r.value) {
      parsed.push({ parsed: r.value, src });
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
    parsed.map(p => classifyMessage(p.parsed))
  );
  let classificationErrors = 0;

  const messages: StoredMessage[] = parsed.map((p, i) => {
    const r = classified[i];
    let cls: RequestClassification | null = null;
    if (r.status === 'fulfilled') cls = r.value;
    else classificationErrors++;
    return {
      ...p.parsed,
      received_iso: p.src.receivedIso,
      subject: p.src.subject,
      group_key: normalizeSubject(p.src.subject),
      building_code: buildingFromListing(p.parsed.listing_name),
      classification: cls,
    };
  });

  const categoryMap = new Map<RequestCategory, number>();
  const groupMap = new Map<
    string,
    {
      guest_name: string;
      listing_name: string | null;
      building_code: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      message_count: number;
      categories: Set<RequestCategory>;
      max_urgency: RequestUrgency;
      has_immediate_complaint: boolean;
      latest_received_iso: string | null;
      latest_summary: string | null;
      latest_suggested_action: string | null;
    }
  >();
  let immediateCount = 0;

  for (const m of messages) {
    if (m.classification) {
      categoryMap.set(
        m.classification.category,
        (categoryMap.get(m.classification.category) || 0) + 1
      );
      if (
        m.classification.urgency === 'immediate' ||
        m.classification.category === 'immediate_complaint'
      )
        immediateCount++;
    }

    const existing = groupMap.get(m.group_key);
    if (existing) {
      existing.message_count += 1;
      if (m.classification) existing.categories.add(m.classification.category);
      if (m.classification?.category === 'immediate_complaint')
        existing.has_immediate_complaint = true;
      const newUrg = m.classification?.urgency;
      if (newUrg && URGENCY_RANK[newUrg] > URGENCY_RANK[existing.max_urgency]) {
        existing.max_urgency = newUrg;
      }
      if (
        m.received_iso &&
        (!existing.latest_received_iso ||
          new Date(m.received_iso) > new Date(existing.latest_received_iso))
      ) {
        existing.latest_received_iso = m.received_iso;
        existing.latest_summary = m.classification?.summary || existing.latest_summary;
        existing.latest_suggested_action =
          m.classification?.suggested_action || existing.latest_suggested_action;
      }
      // Keep first non-null listing/building/dates seen (they should match across the thread)
      if (!existing.listing_name && m.listing_name) existing.listing_name = m.listing_name;
      if (!existing.building_code && m.building_code)
        existing.building_code = m.building_code;
      if (!existing.check_in_date && m.check_in_date)
        existing.check_in_date = m.check_in_date;
      if (!existing.check_out_date && m.check_out_date)
        existing.check_out_date = m.check_out_date;
    } else {
      groupMap.set(m.group_key, {
        guest_name: m.guest_name,
        listing_name: m.listing_name,
        building_code: m.building_code,
        check_in_date: m.check_in_date,
        check_out_date: m.check_out_date,
        message_count: 1,
        categories: new Set(m.classification ? [m.classification.category] : []),
        max_urgency: m.classification?.urgency || 'normal',
        has_immediate_complaint:
          m.classification?.category === 'immediate_complaint',
        latest_received_iso: m.received_iso,
        latest_summary: m.classification?.summary || null,
        latest_suggested_action: m.classification?.suggested_action || null,
      });
    }
  }

  const byCategory: RequestCategoryBucket[] = Array.from(categoryMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const byReservation: RequestReservationGroup[] = Array.from(groupMap.entries())
    .map(([group_key, v]) => ({
      group_key,
      guest_name: v.guest_name,
      listing_name: v.listing_name,
      building_code: v.building_code,
      check_in_date: v.check_in_date,
      check_out_date: v.check_out_date,
      message_count: v.message_count,
      categories: Array.from(v.categories),
      max_urgency: v.max_urgency,
      has_immediate_complaint: v.has_immediate_complaint,
      latest_received_iso: v.latest_received_iso,
      latest_summary: v.latest_summary,
      latest_suggested_action: v.latest_suggested_action,
    }))
    .sort((a, b) => {
      // immediate complaints first, then by urgency rank, then by most recent
      if (a.has_immediate_complaint !== b.has_immediate_complaint)
        return a.has_immediate_complaint ? -1 : 1;
      if (URGENCY_RANK[b.max_urgency] !== URGENCY_RANK[a.max_urgency])
        return URGENCY_RANK[b.max_urgency] - URGENCY_RANK[a.max_urgency];
      const aT = a.latest_received_iso ? new Date(a.latest_received_iso).getTime() : 0;
      const bT = b.latest_received_iso ? new Date(b.latest_received_iso).getTime() : 0;
      return bT - aT;
    });

  return {
    email_count: bodies.length,
    parse_errors: parseErrors,
    parse_failures: failures,
    total_messages: messages.length,
    unique_reservations: groupMap.size,
    immediate_count: immediateCount,
    classification_errors: classificationErrors,
    by_category: byCategory,
    by_reservation: byReservation,
    messages,
  };
}
