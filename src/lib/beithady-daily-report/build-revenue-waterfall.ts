import type { DailyReportPayload, RevenueWaterfallSection } from './types';

// V1 estimation constants.
// V1.5 TODO: pull real channel fees from Odoo Beithady module (per-booking fee
// lines) and real VAT amounts from the booking record or Odoo tax lines.
const ESTIMATED_CHANNEL_FEE_PCT = 0.10; // blended (Airbnb 3–15%, Booking.com 15–18%)
const EGYPT_VAT_PCT = 0.14;              // Egypt standard VAT rate

/**
 * V1 revenue waterfall estimation.
 *
 * gross = revenue_mtd_usd (already the host-payout net of OTA fees,
 * but we treat it as "gross" for illustration purposes — the panel is
 * intentionally approximate; a note in the UI should clarify this).
 *
 * channel_fees ≈ gross × 10%
 * taxes        ≈ (gross − fees) × 14%   (Egypt VAT)
 * net          = gross − fees − taxes
 *
 * Returns null when revenue is missing or negative.
 */
export function buildRevenueWaterfall(
  payload: DailyReportPayload
): RevenueWaterfallSection | null {
  const gross = payload.all?.revenue_mtd_usd;
  if (gross == null || gross < 0) return null;

  const channelFees = gross * ESTIMATED_CHANNEL_FEE_PCT;
  const taxes = (gross - channelFees) * EGYPT_VAT_PCT;
  const net = gross - channelFees - taxes;

  return {
    gross_usd: gross,
    channel_fees_usd: channelFees,
    taxes_usd: taxes,
    net_usd: net,
  };
}
