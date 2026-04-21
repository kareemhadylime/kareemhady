import { anthropic, HAIKU } from '@/lib/anthropic';
import { classifyBuilding } from './beithady-booking';
import { buildingFromListingName } from '../beithady-listings';
import type { StripeApiBreakdown } from '@/lib/stripe-payouts';

export type AirbnbPayoutLineItem = {
  confirmation_code: string;
  guest_name: string;
  listing_name: string | null;
  listing_airbnb_id: string | null;
  booking_type: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  amount: number;
  currency: string;
  is_refund: boolean;
};

export type ParsedAirbnbPayout = {
  total_aed: number;
  total_usd_from_items: number;
  sent_date: string | null;
  arrival_date: string | null;
  bank_iban_last4: string | null;
  line_items: AirbnbPayoutLineItem[];
};

export type ParsedStripePayout = {
  amount: number;
  currency: string;
  arrival_date: string | null;
  bank_name: string | null;
  bank_last4: string | null;
  payout_id: string | null;
};

export type PayoutMonthBucket = {
  month: string;
  label: string;
  airbnb_aed: number;
  stripe_aed: number;
  total_aed: number;
  count: number;
};

export type PayoutBuildingBucket = {
  key: string;
  line_item_count: number;
  unique_reservations: number;
  total_usd: number;
};

export type BeithadyPayoutAggregate = {
  airbnb_email_count: number;
  stripe_email_count: number;
  airbnb_parse_errors: number;
  stripe_parse_errors: number;
  airbnb_parse_failures: Array<{ subject: string; from: string; reason: string }>;
  stripe_parse_failures: Array<{ subject: string; from: string; reason: string }>;
  total_aed: number;
  airbnb_total_aed: number;
  stripe_total_aed: number;
  airbnb_line_items_count: number;
  airbnb_unique_reservations: number;
  airbnb_total_usd: number;
  refund_count: number;
  refund_total_usd: number;
  airbnb_payouts: Array<{
    email_date: string | null;
    total_aed: number;
    total_usd_from_items: number;
    sent_date: string | null;
    arrival_date: string | null;
    bank_iban_last4: string | null;
    line_item_count: number;
  }>;
  airbnb_line_items: Array<
    AirbnbPayoutLineItem & { email_sent_date: string | null; building_code: string | null }
  >;
  stripe_payouts: Array<ParsedStripePayout & { email_date: string | null }>;
  by_month: PayoutMonthBucket[];
  by_building: PayoutBuildingBucket[];
  // Phase 5.8: Stripe API reconciliation
  stripe_api: StripeApiBreakdown | null;
  stripe_api_total_aed: number;
  reconcile_matched: number;    // payout_id present in both email set and API
  reconcile_api_only: number;   // API-visible payouts with no matching email
  reconcile_email_only: number; // email payouts not seen via API in range
  stripe_api_charge_count: number;
  stripe_api_refund_count: number;
  stripe_api_guest_names: number; // transactions where a guest name was extractable from metadata/description
};

const AIRBNB_PAYOUT_SYSTEM = `You parse Airbnb payout-notification emails relayed through Guesty to guesty@beithady.com.

Typical shape:
  Subject: "We sent a payout of 4,938.56 د.إ AED"
  Body starts with "X د.إ AED was sent today", "Your money was sent on April 20 and should arrive by April 27, 2026.", bank account line like "Beithady Hospitality FZCO, IBAN 8439 (AED)".
  Then a list of line items — one per reservation — like:
    Tariq Bakkri                                   $478.33 USD
    Home · 4/19/2026 - 4/30/2026
    Stylish 2BR - Ensuite - Smart Home - By BeitHady - (1429581684132952494)
    HMBBYEWZ3D
  "Home" is the booking type; alternatives include "Pass Through Tot" (pass-through tourism tax — still a positive line). Negative amounts (e.g. -$50.00) indicate refunds/adjustments.

Rules:
- Extract the total AED amount from the subject ("4,938.56 د.إ AED" → 4938.56).
- Extract every line item with confirmation code (HM... 10-char alphanumeric), guest name, amount, currency, booking type, listing name, listing id if shown in parens, check-in/out dates if shown.
- is_refund = true when amount is negative.
- Currency on line items is usually USD; pass through whatever the email shows.
- Be strict: only extract line items that clearly have a confirmation code AND amount. Skip incomplete rows.`;

const AIRBNB_PAYOUT_TOOL = {
  name: 'extract_airbnb_payout',
  description: 'Parse an Airbnb payout-notification email into total + line items.',
  input_schema: {
    type: 'object' as const,
    properties: {
      total_aed: {
        type: 'number',
        description: 'Total AED amount sent (from the subject or opening line).',
      },
      sent_date: {
        type: ['string', 'null'],
        description: 'Date the money was sent, ISO YYYY-MM-DD.',
      },
      arrival_date: {
        type: ['string', 'null'],
        description: 'Expected arrival date, ISO YYYY-MM-DD.',
      },
      bank_iban_last4: {
        type: ['string', 'null'],
        description: 'Last 4 digits of destination IBAN if shown.',
      },
      line_items: {
        type: 'array',
        description: 'One entry per reservation (or refund row) in the payout.',
        items: {
          type: 'object',
          properties: {
            confirmation_code: {
              type: 'string',
              description: 'Airbnb HM-prefixed confirmation code.',
            },
            guest_name: { type: 'string' },
            listing_name: { type: ['string', 'null'] },
            listing_airbnb_id: {
              type: ['string', 'null'],
              description: 'The numeric Airbnb listing id in parens, if shown.',
            },
            booking_type: {
              type: ['string', 'null'],
              description:
                'Type label on the line (e.g. "Home", "Pass Through Tot", "Resolution").',
            },
            check_in_date: { type: ['string', 'null'] },
            check_out_date: { type: ['string', 'null'] },
            amount: {
              type: 'number',
              description:
                'Line amount. Negative for refunds/adjustments; numeric only.',
            },
            currency: { type: 'string', description: 'Line currency, e.g. USD.' },
            is_refund: {
              type: 'boolean',
              description: 'True if this is a refund/adjustment (amount < 0).',
            },
          },
          required: ['confirmation_code', 'guest_name', 'amount', 'currency', 'is_refund'],
        },
      },
    },
    required: ['total_aed', 'line_items'],
  },
};

const STRIPE_PAYOUT_SYSTEM = `You parse Stripe payout-notification emails sent to payments@beithady.com (From: "'Stripe' via Payments beithady").

Typical shape:
  Subject: "Your AED12,076.23 payout for Beithady Hospitality is on the way"
  Body: "AED12,076.23 is on the way", Amount, Estimated arrival, To: BANQUE MISR ••••8439, Payout ID: po_1TMz...

Rules:
- Extract amount and currency (usually AED).
- Extract payout id (starts with "po_").
- Extract estimated arrival date as ISO YYYY-MM-DD if shown.
- Extract bank name and last 4 digits if shown.
- If the email isn't a payout notification (e.g. failed payout, account update, reversal), return null by omitting the tool call.`;

const STRIPE_PAYOUT_TOOL = {
  name: 'extract_stripe_payout',
  description: 'Parse a Stripe payout-notification email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      amount: { type: 'number' },
      currency: { type: 'string' },
      arrival_date: { type: ['string', 'null'] },
      bank_name: { type: ['string', 'null'] },
      bank_last4: { type: ['string', 'null'] },
      payout_id: {
        type: ['string', 'null'],
        description: 'Starts with po_ — the unique Stripe payout identifier.',
      },
    },
    required: ['amount', 'currency'],
  },
};

async function parseAirbnbPayout(
  subject: string,
  bodyText: string
): Promise<ParsedAirbnbPayout | null> {
  const trimmed = bodyText.length > 16000 ? bodyText.slice(0, 16000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmed}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 3000,
    system: [
      { type: 'text', text: AIRBNB_PAYOUT_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [AIRBNB_PAYOUT_TOOL],
    tool_choice: { type: 'tool', name: 'extract_airbnb_payout' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  const rawItems = Array.isArray(raw.line_items) ? (raw.line_items as any[]) : [];
  const lineItems: AirbnbPayoutLineItem[] = rawItems
    .map(li => ({
      confirmation_code: String(li.confirmation_code || '').trim().toUpperCase(),
      guest_name: String(li.guest_name || '').trim(),
      listing_name: li.listing_name ? String(li.listing_name) : null,
      listing_airbnb_id: li.listing_airbnb_id ? String(li.listing_airbnb_id) : null,
      booking_type: li.booking_type ? String(li.booking_type) : null,
      check_in_date: li.check_in_date ? String(li.check_in_date) : null,
      check_out_date: li.check_out_date ? String(li.check_out_date) : null,
      amount: Number(li.amount) || 0,
      currency: String(li.currency || 'USD').trim() || 'USD',
      is_refund: Boolean(li.is_refund) || Number(li.amount) < 0,
    }))
    .filter(li => li.confirmation_code);
  const totalUsd = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  return {
    total_aed: Number(raw.total_aed) || 0,
    total_usd_from_items: Math.round(totalUsd * 100) / 100,
    sent_date: raw.sent_date ? String(raw.sent_date) : null,
    arrival_date: raw.arrival_date ? String(raw.arrival_date) : null,
    bank_iban_last4: raw.bank_iban_last4 ? String(raw.bank_iban_last4) : null,
    line_items: lineItems,
  };
}

async function parseStripePayout(
  subject: string,
  bodyText: string
): Promise<ParsedStripePayout | null> {
  const trimmed = bodyText.length > 8000 ? bodyText.slice(0, 8000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmed}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 600,
    system: [
      { type: 'text', text: STRIPE_PAYOUT_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [STRIPE_PAYOUT_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    amount: Number(raw.amount) || 0,
    currency: String(raw.currency || 'AED').trim() || 'AED',
    arrival_date: raw.arrival_date ? String(raw.arrival_date) : null,
    bank_name: raw.bank_name ? String(raw.bank_name) : null,
    bank_last4: raw.bank_last4 ? String(raw.bank_last4) : null,
    payout_id: raw.payout_id ? String(raw.payout_id) : null,
  };
}

const roundMoney = (n: number) => Math.round(n * 100) / 100;

function buildingFromLineItem(li: AirbnbPayoutLineItem): string | null {
  if (!li.listing_name) return null;
  // Prefer the authoritative listings catalog (handles titles like
  // "Stunning 2BD - Mangroovy - Gouna" that don't embed a BH-code).
  const catalog = buildingFromListingName(li.listing_name);
  if (catalog) return catalog;
  // Fallback to regex extraction for any catalog-miss.
  const m = li.listing_name.match(/\bBH[-\s]?[A-Z0-9]+\b/i);
  if (!m) return null;
  return classifyBuilding(m[0].replace(/\s+/g, ''));
}

export async function aggregateBeithadyPayouts(
  airbnbBodies: Array<{ subject: string; from: string; bodyText: string; receivedIso: string | null }>,
  stripeBodies: Array<{ subject: string; from: string; bodyText: string; receivedIso: string | null }>,
  stripeApi: StripeApiBreakdown | null = null
): Promise<BeithadyPayoutAggregate> {
  const airbnbSettled = await Promise.allSettled(
    airbnbBodies.map(b => parseAirbnbPayout(b.subject, b.bodyText))
  );
  const stripeSettled = await Promise.allSettled(
    stripeBodies.map(b => parseStripePayout(b.subject, b.bodyText))
  );

  const airbnbParsed: Array<{ parsed: ParsedAirbnbPayout; receivedIso: string | null }> = [];
  const airbnbFailures: Array<{ subject: string; from: string; reason: string }> = [];
  let airbnbParseErrors = 0;
  for (let i = 0; i < airbnbSettled.length; i++) {
    const r = airbnbSettled[i];
    const src = airbnbBodies[i];
    if (r.status === 'fulfilled' && r.value) {
      airbnbParsed.push({ parsed: r.value, receivedIso: src.receivedIso });
    } else {
      airbnbParseErrors++;
      const reason =
        r.status === 'rejected'
          ? String(
              (r as PromiseRejectedResult).reason?.message ||
                (r as PromiseRejectedResult).reason ||
                'rejected'
            )
          : 'no_tool_output';
      airbnbFailures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: reason.slice(0, 300),
      });
    }
  }

  const stripeParsed: Array<{ parsed: ParsedStripePayout; receivedIso: string | null }> = [];
  const stripeFailures: Array<{ subject: string; from: string; reason: string }> = [];
  let stripeParseErrors = 0;
  for (let i = 0; i < stripeSettled.length; i++) {
    const r = stripeSettled[i];
    const src = stripeBodies[i];
    if (r.status === 'fulfilled' && r.value) {
      stripeParsed.push({ parsed: r.value, receivedIso: src.receivedIso });
    } else if (r.status === 'rejected') {
      stripeParseErrors++;
      stripeFailures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: String(
          (r as PromiseRejectedResult).reason?.message ||
            (r as PromiseRejectedResult).reason ||
            'rejected'
        ).slice(0, 300),
      });
    }
    // fulfilled-null = not a payout email, silent skip
  }

  let airbnbTotalAed = 0;
  let airbnbLineItemsCount = 0;
  let airbnbTotalUsd = 0;
  let refundCount = 0;
  let refundTotalUsd = 0;
  const uniqueReservations = new Set<string>();
  const buildingMap = new Map<string, PayoutBuildingBucket>();
  const allLineItems: Array<
    AirbnbPayoutLineItem & { email_sent_date: string | null; building_code: string | null }
  > = [];
  const airbnbPayoutsSummary: BeithadyPayoutAggregate['airbnb_payouts'] = [];

  for (const entry of airbnbParsed) {
    const p = entry.parsed;
    airbnbTotalAed += p.total_aed || 0;
    airbnbPayoutsSummary.push({
      email_date: entry.receivedIso,
      total_aed: roundMoney(p.total_aed),
      total_usd_from_items: p.total_usd_from_items,
      sent_date: p.sent_date,
      arrival_date: p.arrival_date,
      bank_iban_last4: p.bank_iban_last4,
      line_item_count: p.line_items.length,
    });
    for (const li of p.line_items) {
      airbnbLineItemsCount++;
      airbnbTotalUsd += li.amount || 0;
      if (li.is_refund) {
        refundCount++;
        refundTotalUsd += li.amount || 0;
      } else if (li.confirmation_code) {
        uniqueReservations.add(li.confirmation_code);
      }
      const building = buildingFromLineItem(li);
      allLineItems.push({
        ...li,
        email_sent_date: p.sent_date,
        building_code: building,
      });
      const bKey = building || 'UNKNOWN';
      const existing = buildingMap.get(bKey);
      if (existing) {
        existing.line_item_count += 1;
        if (!li.is_refund) existing.unique_reservations += 1;
        existing.total_usd += li.amount || 0;
      } else {
        buildingMap.set(bKey, {
          key: bKey,
          line_item_count: 1,
          unique_reservations: li.is_refund ? 0 : 1,
          total_usd: li.amount || 0,
        });
      }
    }
  }

  let stripeTotalAed = 0;
  const stripePayoutsOut: BeithadyPayoutAggregate['stripe_payouts'] = [];
  for (const entry of stripeParsed) {
    const p = entry.parsed;
    stripeTotalAed += p.amount || 0;
    stripePayoutsOut.push({ ...p, email_date: entry.receivedIso });
  }

  // By-month bucket keyed on the email received month (consistent for both sources).
  const monthMap = new Map<string, PayoutMonthBucket>();
  const addToMonth = (
    iso: string | null,
    airbnbAmt: number,
    stripeAmt: number
  ) => {
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const existing = monthMap.get(key);
    if (existing) {
      existing.airbnb_aed += airbnbAmt;
      existing.stripe_aed += stripeAmt;
      existing.total_aed += airbnbAmt + stripeAmt;
      existing.count += 1;
    } else {
      monthMap.set(key, {
        month: key,
        label,
        airbnb_aed: airbnbAmt,
        stripe_aed: stripeAmt,
        total_aed: airbnbAmt + stripeAmt,
        count: 1,
      });
    }
  };
  for (const entry of airbnbParsed) {
    addToMonth(entry.receivedIso, entry.parsed.total_aed || 0, 0);
  }
  for (const entry of stripeParsed) {
    addToMonth(entry.receivedIso, 0, entry.parsed.amount || 0);
  }
  const byMonth = Array.from(monthMap.values())
    .map(m => ({
      ...m,
      airbnb_aed: roundMoney(m.airbnb_aed),
      stripe_aed: roundMoney(m.stripe_aed),
      total_aed: roundMoney(m.total_aed),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byBuilding = Array.from(buildingMap.values())
    .map(b => ({ ...b, total_usd: roundMoney(b.total_usd) }))
    .sort((a, b) => b.total_usd - a.total_usd);

  // Phase 5.8: reconcile Stripe API payouts against email-parsed Stripe payouts.
  const emailPayoutIds = new Set(
    stripePayoutsOut.map(p => p.payout_id).filter((x): x is string => !!x)
  );
  const apiPayoutIds = new Set(
    (stripeApi?.api_payouts || []).map(p => p.payout_id)
  );
  let reconcileMatched = 0;
  let reconcileApiOnly = 0;
  let reconcileEmailOnly = 0;
  for (const id of apiPayoutIds) {
    if (emailPayoutIds.has(id)) reconcileMatched += 1;
    else reconcileApiOnly += 1;
  }
  for (const id of emailPayoutIds) {
    if (!apiPayoutIds.has(id)) reconcileEmailOnly += 1;
  }

  let stripeApiChargeCount = 0;
  let stripeApiRefundCount = 0;
  let stripeApiGuestNames = 0;
  for (const p of stripeApi?.api_payouts || []) {
    for (const t of p.transactions) {
      if (t.type === 'charge' || t.type === 'payment') stripeApiChargeCount += 1;
      if (
        t.type === 'refund' ||
        t.type === 'payment_refund' ||
        t.type === 'payment_failure_refund'
      )
        stripeApiRefundCount += 1;
      if (
        (t.metadata && (t.metadata.guest_name || t.metadata.guestName)) ||
        (t.description && /guest|reservation|booking/i.test(t.description))
      ) {
        stripeApiGuestNames += 1;
      }
    }
  }

  return {
    airbnb_email_count: airbnbBodies.length,
    stripe_email_count: stripeBodies.length,
    airbnb_parse_errors: airbnbParseErrors,
    stripe_parse_errors: stripeParseErrors,
    airbnb_parse_failures: airbnbFailures,
    stripe_parse_failures: stripeFailures,
    total_aed: roundMoney(airbnbTotalAed + stripeTotalAed),
    airbnb_total_aed: roundMoney(airbnbTotalAed),
    stripe_total_aed: roundMoney(stripeTotalAed),
    airbnb_line_items_count: airbnbLineItemsCount,
    airbnb_unique_reservations: uniqueReservations.size,
    airbnb_total_usd: roundMoney(airbnbTotalUsd),
    refund_count: refundCount,
    refund_total_usd: roundMoney(refundTotalUsd),
    airbnb_payouts: airbnbPayoutsSummary,
    airbnb_line_items: allLineItems.map(li => ({
      ...li,
      amount: roundMoney(li.amount),
    })),
    stripe_payouts: stripePayoutsOut.map(p => ({
      ...p,
      amount: roundMoney(p.amount),
    })),
    by_month: byMonth,
    by_building: byBuilding,
    stripe_api: stripeApi,
    stripe_api_total_aed: stripeApi?.total_amount ?? 0,
    reconcile_matched: reconcileMatched,
    reconcile_api_only: reconcileApiOnly,
    reconcile_email_only: reconcileEmailOnly,
    stripe_api_charge_count: stripeApiChargeCount,
    stripe_api_refund_count: stripeApiRefundCount,
    stripe_api_guest_names: stripeApiGuestNames,
  };
}
