// Conversation classification helpers. Take a guest's message text plus
// reservation context and return the same structured category/urgency
// verdict the email aggregators produced via Claude Haiku. Used by the
// Phase 3B sync path — classifications are stored on guesty_conversations
// once, then read by the inquiry/request aggregators on every rule run.

import { anthropic, HAIKU } from '@/lib/anthropic';
import type {
  InquiryCategory,
  InquiryClassification,
} from './aggregators/beithady-inquiry';
import type {
  RequestCategory,
  RequestClassification,
  RequestUrgency,
} from './aggregators/beithady-request';

// ---------- Inquiry (pre-booking) ----------

const INQUIRY_SYSTEM = `You classify pre-booking questions from potential guests on a short-term rental platform (Airbnb, Booking.com, Direct). You will receive the guest's message text and the listing + stay context. Return ONE category that best fits:

- location_info: where is the property, how close to landmarks/airport/metro, neighborhood safety, directions
- amenity: what's included (wifi, pool, gym, parking, kitchen appliances, pet-friendly, accessibility)
- pricing: cost breakdown, discounts, deposit, long-stay rate, weekly/monthly price
- booking_logistics: how to reserve, cancellation policy, payment method, ID/passport required, invoice
- availability: is the unit free for dates X-Y, blocking additional days, alternative listings
- group_question: large group (>N guests), children, events/parties, specific guest mix
- other: anything that doesn't fit the above or is not actually a question (e.g. "can you confirm my booking")

Also return:
- summary: 1-sentence rephrasing of what the guest is actually asking
- needs_manual_attention: true if the question requires human judgment (unusual request, medical/accessibility, group size, pricing negotiation, VIP/corporate); false if a templated/FAQ answer suffices`;

const INQUIRY_TOOL = {
  name: 'classify_inquiry',
  description: 'Classify a guest pre-booking question into one of the 7 categories.',
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

export async function classifyInquiry(args: {
  text: string;
  listingName?: string | null;
  stayStart?: string | null;
  stayEnd?: string | null;
  numAdults?: number | null;
  numChildren?: number | null;
}): Promise<InquiryClassification | null> {
  const content = [
    `LISTING: ${args.listingName || 'unknown'}`,
    `STAY: ${args.stayStart || '?'} → ${args.stayEnd || '?'}`,
    args.numAdults || args.numChildren
      ? `GUESTS: ${args.numAdults || '?'} adults, ${args.numChildren || 0} children`
      : '',
    '',
    `GUEST MESSAGE:`,
    args.text.slice(0, 4000),
  ]
    .filter(Boolean)
    .join('\n');

  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 400,
    system: [
      { type: 'text', text: INQUIRY_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [INQUIRY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_inquiry' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    category: (String(raw.category || 'other') as InquiryCategory),
    summary: String(raw.summary || '').trim(),
    needs_manual_attention: Boolean(raw.needs_manual_attention),
  };
}

// ---------- Request (in-stay messaging) ----------

const REQUEST_SYSTEM = `You classify messages from existing guests (with a confirmed or active reservation) on a short-term rental platform. You will receive the guest's message text + reservation context. Return one category + one urgency tier + operational suggestion.

Categories:
- date_change: request to shift check-in/out, extend stay, early check-in, late check-out
- amenity_request: ask for extra towels/beds/kitchen items/toiletries, complaint about missing amenity
- immediate_complaint: problem right now — AC not working, noise, pest, broken lock, lost keys, cleanliness failure, safety concern, wifi down
- refund_dispute: request money back, dispute charge, claim overcharge, chargeback threat
- check_in_help: check-in instructions, access code, address/directions, unable to reach property
- general_question: house rules, neighborhood recommendations, local activities, how things work
- other: thank-you, goodbye, spam, or anything not covered

Urgency:
- immediate: safety, can't get in, critical system failure, pest/emergency → resolve within 1 hour
- high: active inconvenience affecting the stay experience → resolve within 4 hours
- normal: non-urgent — general Q, thank-you, casual request → resolve same day

Also return:
- summary: 1-sentence distillation of what the guest needs
- suggested_action: one concrete operational next step for the host (e.g. "Dispatch maintenance to unit X for the AC", "Send the guest the smart-lock code")`;

const REQUEST_TOOL = {
  name: 'classify_request',
  description: 'Classify an in-stay guest message into category + urgency.',
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
      urgency: {
        type: 'string',
        enum: ['immediate', 'high', 'normal'],
      },
      summary: { type: 'string' },
      suggested_action: { type: 'string' },
    },
    required: ['category', 'urgency', 'summary', 'suggested_action'],
  },
};

export async function classifyRequest(args: {
  text: string;
  listingName?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
}): Promise<RequestClassification | null> {
  const now = new Date();
  const dateFormatter = (iso: string | null | undefined) =>
    iso ? iso.slice(0, 10) : '?';
  const stayPhase = (() => {
    if (!args.checkIn || !args.checkOut) return 'unknown';
    const ci = new Date(args.checkIn).getTime();
    const co = new Date(args.checkOut).getTime();
    const t = now.getTime();
    if (t < ci) return 'pre-arrival';
    if (t >= ci && t < co) return 'in-stay';
    return 'post-stay';
  })();

  const content = [
    `LISTING: ${args.listingName || 'unknown'}`,
    `CHECK-IN: ${dateFormatter(args.checkIn)}`,
    `CHECK-OUT: ${dateFormatter(args.checkOut)}`,
    `STAY PHASE: ${stayPhase}`,
    '',
    `GUEST MESSAGE:`,
    args.text.slice(0, 4000),
  ].join('\n');

  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 500,
    system: [
      { type: 'text', text: REQUEST_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [REQUEST_TOOL],
    tool_choice: { type: 'tool', name: 'classify_request' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    category: (String(raw.category || 'other') as RequestCategory),
    urgency: (String(raw.urgency || 'normal') as RequestUrgency),
    summary: String(raw.summary || '').trim(),
    suggested_action: String(raw.suggested_action || '').trim(),
  };
}
