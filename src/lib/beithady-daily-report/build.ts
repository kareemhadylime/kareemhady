import 'server-only';
import {
  cairoMonthContext,
  cairoYmd,
  monthLabel,
  reportDateLabel,
  addDays,
} from './cairo-dates';
import { loadBuildingInventories } from './units';
import { loadReservationCorpus } from './reservations';
import { buildBuildingsTable } from './build-buildings';
import { buildPayoutsSection } from './build-payouts';
import { buildReviewsSection } from './build-reviews';
import {
  buildChannelMix,
  buildCancellations,
  buildDeadInventoryAsync,
  buildPricingAlerts,
  buildInquiryTriage,
  buildCleaningOps,
} from './build-extras';
import type { DailyReportPayload } from './types';

// Orchestrator. Single entry point: returns a fully-built DailyReportPayload
// for a given Cairo wall date. Throws on unrecoverable build errors so the
// retry-until-success cron can keep trying through the day.

export async function buildDailyReport(
  reportDateYmd?: string
): Promise<DailyReportPayload> {
  const today = reportDateYmd || cairoYmd();
  const ctx = cairoMonthContext(today);
  const generatedAt = new Date();
  const fxDate = generatedAt;

  // Pull inventories first — needed by buildings + dead-inventory.
  const inventories = await loadBuildingInventories();

  // Reservation window: month_start - 30 days (catches stays that started
  // before the month and continue into it) → next 14 days (dead inventory).
  const windowFrom = addDays(ctx.start, -30);
  const windowTo = addDays(ctx.today, 14);
  const corpus = await loadReservationCorpus(windowFrom, windowTo, fxDate);

  // Run the per-section builders. Some are sync (no IO); some are async
  // (Stripe API, Anthropic, Postgres count queries). Run async ones in parallel.
  const buildings = buildBuildingsTable(corpus.active, inventories, ctx);
  const channel_mix = buildChannelMix(corpus.active, ctx);
  const cancellations = buildCancellations(corpus.canceled, ctx);
  const cleaning_ops_today = buildCleaningOps(corpus.active, ctx);

  const [
    payoutsResult,
    reviewsResult,
    deadInventory,
    pricingResult,
    triageResult,
  ] = await Promise.all([
    buildPayoutsSection(corpus.active, ctx),
    buildReviewsSection(ctx),
    buildDeadInventoryAsync(corpus.active, inventories, ctx),
    buildPricingAlerts(),
    buildInquiryTriage(),
  ]);

  const warnings = [
    ...payoutsResult.warnings,
    ...reviewsResult.warnings,
    ...pricingResult.warnings,
    ...triageResult.warnings,
  ];

  // Plain-English digest.
  const digest = composeDigest({
    today,
    occupiedAll: buildings.all.occupied_today,
    totalUnits: buildings.all.total_units,
    occPct: buildings.all.occupancy_today_pct,
    checkIns: buildings.all.check_ins_today,
    checkOuts: buildings.all.check_outs_today,
    turnovers: buildings.all.turnovers_today,
    revenueMtd: buildings.all.revenue_mtd_usd,
    pickupPct: buildings.all.pickup_vs_prior_month_pct,
    monthLabelStr: monthLabel(today),
    reviewsCount: reviewsResult.section.count_mtd,
    avgRating: reviewsResult.section.avg_rating_mtd,
    flaggedCount: reviewsResult.section.last_24h.filter(r => r.flagged).length,
  });

  // FX rates used (read from cache table for transparency).
  const fxRatesUsed: { quote: string; rate: number; source: string }[] = [];
  // (Not querying again here — just record currencies seen.)
  const seenCurrencies = new Set<string>();
  for (const r of corpus.active) {
    if (r.currency && r.currency !== 'USD') seenCurrencies.add(r.currency);
  }

  return {
    report_date: today,
    generated_at_iso: generatedAt.toISOString(),
    generated_at_cairo: `${reportDateLabel(today)} · 09:00 Cairo`,
    month_label: monthLabel(today),
    month_days_total: ctx.days_total,
    month_days_elapsed: ctx.days_elapsed,
    all: buildings.all,
    per_building: buildings.per_building,
    payouts: payoutsResult.section,
    reviews: reviewsResult.section,
    channel_mix,
    cancellations,
    dead_inventory: deadInventory,
    pricing_alerts: pricingResult.alerts,
    inquiry_triage: triageResult.triage,
    cleaning_ops_today,
    digest_oneliner: digest,
    build_warnings: warnings,
    fx_rates_used: fxRatesUsed,
  };
}

function composeDigest(p: {
  today: string;
  occupiedAll: number;
  totalUnits: number;
  occPct: number;
  checkIns: number;
  checkOuts: number;
  turnovers: number;
  revenueMtd: number;
  pickupPct: number;
  monthLabelStr: string;
  reviewsCount: number;
  avgRating: number;
  flaggedCount: number;
}): string {
  const fmtUsd = (n: number) =>
    n >= 1000
      ? `$${Math.round(n / 1000).toLocaleString('en-US')}k`
      : `$${Math.round(n).toLocaleString('en-US')}`;
  const pickup =
    p.pickupPct === 0
      ? ''
      : p.pickupPct > 0
        ? ` (▲ +${p.pickupPct.toFixed(1)}% vs last month)`
        : ` (▼ ${p.pickupPct.toFixed(1)}% vs last month)`;
  const flag =
    p.flaggedCount > 0 ? ` · ${p.flaggedCount} flagged 🚩` : '';
  return (
    `Today: ${p.occupiedAll}/${p.totalUnits} occupied (${p.occPct.toFixed(1)}%). ` +
    `${p.checkIns} check-ins · ${p.checkOuts} check-outs · ${p.turnovers} turnovers. ` +
    `${p.monthLabelStr} revenue ${fmtUsd(p.revenueMtd)}${pickup}. ` +
    `${p.reviewsCount} reviews this month · ${p.avgRating.toFixed(1)}★ avg${flag}.`
  );
}
