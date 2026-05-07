// Beithady · Fee Audit · pure quote calculator.
// Given (listing, channel, dateIso, nights, guests) → FeeBreakdown.
// All math in USD. Native-currency conversion is done upstream.

import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import type { FeeBreakdown, ListingTax } from './types';
import { getChannelFee } from './channel-fees';
// applyTaxes() intentionally NOT imported — Guesty prices are all-inclusive
// per Q (2026-05-07), so we don't stack VAT/tourism/service on top. The
// tax-applier module remains for any future reporting flow that needs the
// embedded tax breakdown.

type DailyRow = {
  listing_id: string;
  date: string;
  base_price: number | null;
  is_weekend: boolean | null;
  weekly_discount_pct: number | null;
  monthly_discount_pct: number | null;
  last_minute_discount_pct: number | null;
  channel_overrides: Record<string, number> | null;
};

type TermsRow = {
  cleaning_fee: number | null;
  pet_fee: number | null;
  extra_guest_fee: number | null;
  extra_guest_threshold: number | null;
  security_deposit: number | null;
  taxes: ListingTax[] | null;
  min_nights_default: number | null;
  min_nights_per_channel: Record<string, number> | null;
};

export type QuoteInput = {
  listingId: string;
  channel: ChannelBucket;
  dateIso: string;       // first night
  nights: number;
  guests: number;
  petCount?: number;
};

export type ChannelFeeConfig = {
  host_commission_pct: number;
  guest_service_pct: number;
  guest_service_min?: number | null;
  guest_service_max?: number | null;
  /**
   * VAT applied to the commission itself (Airbnb Egypt = 14, others 0).
   * Effective host fee = host_commission_pct × (1 + vat_on_commission_pct/100).
   */
  vat_on_commission_pct: number;
};

/**
 * Synchronous quote calculator — takes pre-loaded data instead of doing 2
 * DB round-trips per call. Used by `buildFeeStack` to compute per-listing ×
 * per-day × per-channel breakdowns without N+1 queries.
 *
 * The async `quoteStay()` below remains for the live `/api/.../quote`
 * endpoint where the operator types one stay at a time.
 */
export function quoteStayInMemory(input: {
  channel: ChannelBucket;
  nights: number;
  guests: number;
  petCount?: number;
  days: DailyRow[];                          // already filtered to stay window
  terms: TermsRow | null;
  channelCfg: ChannelFeeConfig;
}): FeeBreakdown {
  const { channel, nights, guests, petCount, days, terms: termsIn, channelCfg } = input;
  const channelKey = mapChannelKey(channel);
  const terms = termsIn || {
    cleaning_fee: null, pet_fee: null, extra_guest_fee: null, extra_guest_threshold: null,
    security_deposit: null, taxes: null, min_nights_default: null, min_nights_per_channel: null,
  };

  let baseTotal = 0;
  for (const d of days) {
    const override = d.channel_overrides?.[channelKey];
    const rate = override ?? d.base_price ?? 0;
    baseTotal += rate;
  }

  let discountedBase = baseTotal;
  if (nights >= 7) {
    const wkPct = days[0]?.weekly_discount_pct;
    if (wkPct) discountedBase *= 1 - wkPct / 100;
  }
  if (nights >= 28) {
    const moPct = days[0]?.monthly_discount_pct;
    if (moPct) discountedBase *= 1 - moPct / 100;
  }

  const cleaning = Number(terms.cleaning_fee || 0);
  const pet = Number(terms.pet_fee || 0) * (petCount || 0);
  const extraGuest =
    terms.extra_guest_threshold != null && guests > terms.extra_guest_threshold
      ? Number(terms.extra_guest_fee || 0) *
        (guests - terms.extra_guest_threshold) *
        nights
      : 0;
  const securityDeposit = Number(terms.security_deposit || 0);

  // Per Q (2026-05-07): Guesty prices are ALL-INCLUSIVE — VAT, tourism tax,
  // and service charge are baked into the base + cleaning rates configured in
  // Guesty. We do NOT compute or stack additional taxes on top.
  const taxesApplied: { total_usd: number; breakdown: Array<{ type: string; amount_usd: number }> } = {
    total_usd: 0,
    breakdown: [],
  };

  // Manual / direct-website bookings carry no channel commission and no
  // channel-side guest service fee — the guest pays the listed price directly
  // to the host.
  const isDirectBooking = channel === 'manual';

  const commissionableBase = discountedBase + cleaning;
  const fee = computeHostServiceFee(channelCfg, commissionableBase, isDirectBooking);
  const channelCommission = fee.total_usd;

  let guestService = isDirectBooking
    ? 0
    : (commissionableBase * channelCfg.guest_service_pct) / 100;
  if (!isDirectBooking) {
    if (channelCfg.guest_service_min != null && guestService < channelCfg.guest_service_min) {
      guestService = channelCfg.guest_service_min;
    }
    if (channelCfg.guest_service_max != null && guestService > channelCfg.guest_service_max) {
      guestService = channelCfg.guest_service_max;
    }
  }

  const totalGuestPays =
    discountedBase + cleaning + pet + extraGuest + guestService;
  const totalHostReceives =
    discountedBase + cleaning + pet + extraGuest - channelCommission;

  const minNights =
    (terms.min_nights_per_channel && terms.min_nights_per_channel[channelKey]) ??
    terms.min_nights_default ??
    null;

  return {
    base_rate_total_usd: discountedBase,
    weekend_uplift_usd: 0,
    cleaning_usd: cleaning,
    pet_usd: pet,
    extra_guest_usd: extraGuest,
    taxes_usd: taxesApplied.total_usd,
    taxes_breakdown: taxesApplied.breakdown,
    channel_commission_usd: channelCommission,
    channel_commission_label: fee.label,
    guest_service_fee_usd: guestService,
    security_deposit_usd: securityDeposit,
    total_guest_pays_usd: totalGuestPays,
    total_host_receives_usd: totalHostReceives,
    min_nights_required: minNights,
  };
}

export async function quoteStay(input: QuoteInput): Promise<FeeBreakdown> {
  const sb = supabaseAdmin();

  // Pull daily rows for the stay window
  const dateTo = addDays(input.dateIso, input.nights - 1);
  const { data: dailyRows } = await sb
    .from('beithady_pricelabs_daily_rates')
    .select('listing_id, date, base_price, is_weekend, weekly_discount_pct, monthly_discount_pct, last_minute_discount_pct, channel_overrides')
    .eq('listing_id', input.listingId)
    .gte('date', input.dateIso)
    .lte('date', dateTo);

  const days = (dailyRows as DailyRow[] | null) || [];

  // Pull listing terms
  const { data: termsRow } = await sb
    .from('beithady_listing_terms')
    .select('*')
    .eq('listing_id', input.listingId)
    .maybeSingle();
  const terms = (termsRow as TermsRow | null) || {
    cleaning_fee: null, pet_fee: null, extra_guest_fee: null, extra_guest_threshold: null,
    security_deposit: null, taxes: null, min_nights_default: null, min_nights_per_channel: null,
  };

  const channelKey = mapChannelKey(input.channel);

  // Sum nightly rate (use channel override if present, else base_price)
  let baseTotal = 0;
  let weekendUplift = 0;
  for (const d of days) {
    const override = d.channel_overrides?.[channelKey];
    const rate = override ?? d.base_price ?? 0;
    baseTotal += rate;
    if (d.is_weekend && d.base_price) {
      // Weekend uplift = (rate - base) is implied to be the weekend uplift,
      // but PriceLabs already bakes it in, so we estimate the "uplift" as 0
      // unless channel_overrides differ. Keeping 0 for now.
    }
  }

  // Apply discount stack
  let discountedBase = baseTotal;
  // Last-minute (closest day's value) — informational only; channel applies it
  // Weekly (>= 7 nights)
  if (input.nights >= 7) {
    const wkPct = days[0]?.weekly_discount_pct;
    if (wkPct) discountedBase *= 1 - wkPct / 100;
  }
  // Monthly (>= 28 nights)
  if (input.nights >= 28) {
    const moPct = days[0]?.monthly_discount_pct;
    if (moPct) discountedBase *= 1 - moPct / 100;
  }

  const cleaning = Number(terms.cleaning_fee || 0);
  const pet = Number(terms.pet_fee || 0) * (input.petCount || 0);
  const extraGuest =
    terms.extra_guest_threshold != null && input.guests > terms.extra_guest_threshold
      ? Number(terms.extra_guest_fee || 0) *
        (input.guests - terms.extra_guest_threshold) *
        input.nights
      : 0;
  const securityDeposit = Number(terms.security_deposit || 0);

  // Per Q (2026-05-07): Guesty prices are ALL-INCLUSIVE — VAT, tourism tax,
  // and service charge are baked into the base + cleaning rates configured in
  // Guesty. We do NOT compute or stack additional taxes on top.
  const taxesApplied: { total_usd: number; breakdown: Array<{ type: string; amount_usd: number }> } = {
    total_usd: 0,
    breakdown: [],
  };

  // Channel commission (host pays out of fareAccommodation+cleaning).
  // Manual / direct-website bookings carry no channel commission and no
  // channel-side guest service fee — guest pays the listed price directly.
  const channelCfg = await getChannelFee(input.channel);
  const isDirectBooking = input.channel === 'manual';
  const commissionableBase = discountedBase + cleaning;
  const fee = computeHostServiceFee(channelCfg, commissionableBase, isDirectBooking);
  const channelCommission = fee.total_usd;

  // Guest service fee (channel adds on top, what guest sees)
  let guestService = isDirectBooking
    ? 0
    : (commissionableBase * channelCfg.guest_service_pct) / 100;
  if (!isDirectBooking) {
    if (channelCfg.guest_service_min != null && guestService < channelCfg.guest_service_min) {
      guestService = channelCfg.guest_service_min;
    }
    if (channelCfg.guest_service_max != null && guestService > channelCfg.guest_service_max) {
      guestService = channelCfg.guest_service_max;
    }
  }

  const totalGuestPays =
    discountedBase + cleaning + pet + extraGuest + guestService;
  const totalHostReceives =
    discountedBase + cleaning + pet + extraGuest - channelCommission;

  const minNights =
    (terms.min_nights_per_channel && terms.min_nights_per_channel[channelKey]) ??
    terms.min_nights_default ??
    null;

  return {
    base_rate_total_usd: discountedBase,
    weekend_uplift_usd: weekendUplift,
    cleaning_usd: cleaning,
    pet_usd: pet,
    extra_guest_usd: extraGuest,
    taxes_usd: taxesApplied.total_usd,
    taxes_breakdown: taxesApplied.breakdown,
    channel_commission_usd: channelCommission,
    channel_commission_label: fee.label,
    guest_service_fee_usd: guestService,
    security_deposit_usd: securityDeposit,
    total_guest_pays_usd: totalGuestPays,
    total_host_receives_usd: totalHostReceives,
    min_nights_required: minNights,
  };
}

/**
 * Compute the host's effective OTA fee = base commission + VAT-on-commission.
 *
 * Per real OTA invoices reviewed 2026-05-07:
 *   - Airbnb (Egypt): 15.5% commission + 14% VAT applied to that commission.
 *     Guest pays Base + Cleaning only — no separate guest service fee.
 *   - Booking.com / VRBO / Expedia / Hotels.com: ~15% commission, no VAT
 *     on commission, no guest service fee.
 *   - Manual / direct-website: 0%, host receives full Base + Cleaning.
 *
 * Returns the dollar amount and a human-readable label like
 * "15.5% + 14% VAT" so the UI can match the real invoice format.
 */
function computeHostServiceFee(
  cfg: ChannelFeeConfig,
  commissionableBase: number,
  isDirectBooking: boolean
): { total_usd: number; label: string } {
  if (isDirectBooking || cfg.host_commission_pct <= 0) {
    return { total_usd: 0, label: '' };
  }
  const baseCommission = (commissionableBase * cfg.host_commission_pct) / 100;
  const vatOnCommission =
    cfg.vat_on_commission_pct > 0
      ? (baseCommission * cfg.vat_on_commission_pct) / 100
      : 0;
  const total = baseCommission + vatOnCommission;
  const label =
    cfg.vat_on_commission_pct > 0
      ? `${trimPct(cfg.host_commission_pct)}% + ${trimPct(cfg.vat_on_commission_pct)}% VAT`
      : `${trimPct(cfg.host_commission_pct)}%`;
  return { total_usd: total, label };
}

function trimPct(n: number): string {
  // 15 → "15", 15.5 → "15.5", 14 → "14"
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mapChannelKey(channel: ChannelBucket): string {
  switch (channel) {
    case 'airbnb': return 'airbnb';
    case 'booking_com': return 'booking_com';
    case 'other_ota': return 'vrbo';
    case 'manual': return 'manual';
  }
}
