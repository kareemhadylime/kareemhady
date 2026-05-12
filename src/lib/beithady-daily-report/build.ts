import 'server-only';
import {
  cairoMonthContext,
  cairoYmd,
  monthLabel,
  reportDateLabel,
  addDays,
  yesterday as yesterdayOf,
  reportPeriodWindow,
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
import { buildConversationsSection } from './build-conversations';
import { buildCheckinPaymentSection } from './build-payment-checkins';
import { buildBlocksSection } from './build-blocks';
import { buildNoShowSection } from './build-no-show';
import { buildWeeklyDigest } from './build-weekly-digest';
import { buildPairedChannelMix } from './build-channels-paired';
import { buildPricingIntelligenceSection } from './build-pricing-intelligence';
import { buildRevenueConcentration } from './build-revenue-concentration';
import { buildRevpar } from './build-revpar';
import { buildCancelRisk } from './build-cancel-risk';
import { buildStly } from './build-stly';
import { buildSparklines } from './build-sparklines';
import { buildTopMovers } from './build-top-movers';
import { buildForwardOccupancy } from './build-forward-occupancy';
import { buildOccupancyGaps } from './build-occupancy-gaps';
import { buildRevenueWaterfall } from './build-revenue-waterfall';
import { buildAIInsights } from './build-insights';
import { buildReviewTopics } from './build-review-topics';
import type { DailyReportPayload, BuildingCode } from './types';

// Orchestrator. Single entry point: returns a fully-built DailyReportPayload
// for a given Cairo wall date. Throws on unrecoverable build errors so the
// retry-until-success cron can keep trying through the day.

export async function buildDailyReport(
  reportDateYmd?: string
): Promise<DailyReportPayload> {
  // v3 date semantics (2026-05-12): the report describes TODAY live.
  // `today` = the wall date the report covers (Cairo); `yesterdayDate`
  // = the day that just closed (used for backward-looking metrics such
  // as no-shows, payment check-ins, and the weekly digest).
  //
  // v3 audit (2026-05-12): builders consuming `today` / `ctx.today`:
  //   build-buildings.ts:          A — occupied/check-ins "today" correctly uses actual today
  //   build-payouts.ts:            A — Airbnb MTD uses [start, yesterday] internally; next-7d from today correct
  //   build-extras / CancelMix:    A — cancellations "today" = live today metric (details_ label is legacy)
  //   build-extras / DeadInv:      A — forward dead-inventory window from today correct
  //   build-extras / CleaningOps:  A — cleaning ops today (checkout+checkin on today) correct
  //   build-reviews.ts:            A — last24Iso = addDays(ctx.today, -1) = yesterday; correct after flip
  //   build-no-show.ts:            A (not affected) — uses ReportPeriodWindow.yesterday, not today
  //   build-payment-checkins.ts:   A (not affected) — uses ReportPeriodWindow.yesterday, not today
  //   build-weekly-digest.ts:      A (not affected) — uses ReportPeriodWindow.yesterday/week_start
  //   build-channels-paired.ts:    A (not affected) — uses ReportPeriodWindow.yesterday/mtd_*
  //   build-conversations.ts:      A (not affected) — uses ReportPeriodWindow.*_iso fields
  //   build-blocks.ts:             A (not affected) — uses ctx.yesterday + ctx.generated_today already
  //   build-cancel-risk.ts:        A — forward risk from today correct
  //   build-stly.ts:               A — 365d lookback from today correct
  //   build-sparklines.ts:         A — last 7 snapshots up to today correct
  //   build-top-movers.ts:         A — 7d WoW from today correct
  //   build-forward-occupancy.ts:  A — 7/30/60d forward from today correct
  //   build-occupancy-gaps.ts:     A — 14d gap scan from today correct
  //   build-revpar.ts:             A — pure function; uses ctx.days_elapsed (today-anchored) correct
  //   build-revenue-concentration: A — pure function, no dates
  //   build-revenue-waterfall:     A — pure function, no dates
  //   build-insights.ts:           A — takes full payload, no date param
  //   build-review-topics.ts:      A — takes last_24h array, no date param
  //
  // No Category-B builders identified: all builders that need "the day
  // just closed" already read from ReportPeriodWindow.yesterday (which is
  // derived from generationDate, not from this `today` variable).
  const today = reportDateYmd || cairoYmd();
  const yesterdayDate = yesterdayOf(today);
  const ctx = cairoMonthContext(today);
  const period = reportPeriodWindow(today);
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

  // Backward-looking sync builders (anchored to yesterday via ReportPeriodWindow)
  const checkin_payment = buildCheckinPaymentSection(corpus.active, period);
  const no_show = buildNoShowSection(corpus.active, period);
  const weekly_digest = buildWeeklyDigest(corpus.active, corpus.canceled, period);
  const paired_channel_mix = buildPairedChannelMix(corpus.active, period);

  const [
    payoutsResult,
    reviewsResult,
    deadInventory,
    pricingResult,
    triageResult,
    conversationsResult,
    blocksResult,
    pricingIntelResult,
  ] = await Promise.all([
    buildPayoutsSection(corpus.active, ctx),
    buildReviewsSection(ctx),
    buildDeadInventoryAsync(corpus.active, inventories, ctx),
    buildPricingAlerts(),
    buildInquiryTriage(),
    buildConversationsSection(period),
    buildBlocksSection(inventories, period),
    buildPricingIntelligenceSection(),
  ]);

  // ── Phase 3 v4 builders ───────────────────────────────────────────────────

  // unitCounts: Record<BuildingCode, number> — derived from inventories
  const unitCounts: Record<BuildingCode, number> = {
    'BH-26':  inventories['BH-26']?.total_units  ?? 0,
    'BH-73':  inventories['BH-73']?.total_units  ?? 0,
    'BH-435': inventories['BH-435']?.total_units ?? 0,
    'BH-OK':  inventories['BH-OK']?.total_units  ?? 0,
    'OTHER':  inventories['OTHER']?.total_units  ?? 0,
  };

  // Pure sync builders
  const revparResult = buildRevpar({
    all: buildings.all,
    perBuilding: buildings.per_building,
    daysElapsed: ctx.days_elapsed,
  });

  const revenueConcentration = buildRevenueConcentration(
    buildings.per_building,
    channel_mix
  );

  // Partial payload forwarded to builders that look up prior snapshots
  const currentForDerived = {
    all: buildings.all,
    per_building: buildings.per_building,
    reviews: reviewsResult.section,
    conversations: conversationsResult.section,
    paired_channel_mix: paired_channel_mix,
    channel_mix: channel_mix,
  } as DailyReportPayload;

  const revenueWaterfall = buildRevenueWaterfall(currentForDerived);

  // IO builders — run in parallel
  const [
    cancelRisk,
    stly,
    sparklines,
    topMovers,
    forwardOccupancy,
    occupancyGaps,
  ] = await Promise.all([
    buildCancelRisk(today),
    buildStly(today, currentForDerived),
    buildSparklines(today),
    buildTopMovers(today, currentForDerived),
    buildForwardOccupancy(today, unitCounts),
    buildOccupancyGaps(today, unitCounts),
  ]);

  // ── Phase 5 v5 AI builders ────────────────────────────────────────────────
  // Run after all Phase 3 builders have populated currentForDerived.
  // Fail-soft: both return null if ANTHROPIC_API_KEY is absent or API errors.
  const currentWithReviews = {
    ...currentForDerived,
    cancel_risk: cancelRisk,
    goal: null,
    inquiry_triage: triageResult.triage,
  } as DailyReportPayload;

  const [aiInsights, reviewTopics] = await Promise.all([
    buildAIInsights(currentWithReviews),
    buildReviewTopics(reviewsResult.section.last_24h),
  ]);

  const warnings = [
    ...payoutsResult.warnings,
    ...reviewsResult.warnings,
    ...pricingResult.warnings,
    ...triageResult.warnings,
    ...conversationsResult.warnings,
  ];

  // Plain-English digest. v3: leads with "Today (YYYY-MM-DD): …"
  // so the recipient sees the actual date the report describes live.
  const digest = composeDigest({
    today,
    occupiedAll: buildings.all.occupied_today,
    totalUnits: buildings.all.total_units,
    occPct: buildings.all.occupancy_today_pct,
    checkIns: buildings.all.check_ins_today,
    checkOuts: buildings.all.check_outs_today,
    turnovers: buildings.all.turnovers_today,
    revenueMtd: buildings.all.revenue_mtd_usd,
    revenueCreatedMtd: buildings.all.revenue_created_mtd_usd,
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

  // Cancellation popout details (today's actually-canceled rows; field name is legacy v2).
  const cancellationDetails = (cancellations as unknown as {
    details_yesterday?: DailyReportPayload['cancellation_details'];
  }).details_yesterday || [];

  return {
    report_date: today,
    generated_at_iso: generatedAt.toISOString(),
    // v3: report describes today live; header is just the date + time.
    // "Mon, 12 May 2026 · 09:00 Cairo"
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
    // v2 additions
    period_yesterday: yesterdayDate,
    period_generated_today: today,
    cancellation_details: cancellationDetails,
    conversations: conversationsResult.section,
    checkin_payment,
    blocks: blocksResult,
    no_show,
    weekly_digest,
    paired_channel_mix,
    pricing_intelligence: pricingIntelResult.section.available
      ? pricingIntelResult.section
      : null,
    // v4 Phase 3 fields
    revpar: revparResult,
    revenue_concentration: revenueConcentration,
    forward_occupancy: forwardOccupancy,
    occupancy_gaps: occupancyGaps,
    cancel_risk: cancelRisk,
    revenue_waterfall: revenueWaterfall,
    stly: stly,
    top_movers: topMovers,
    sparklines: sparklines,
    // v5 AI-derived
    insights: aiInsights,
    review_topics: reviewTopics,
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
  revenueCreatedMtd: number;
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
    `Today (${p.today}): ${p.occupiedAll}/${p.totalUnits} occupied (${p.occPct.toFixed(1)}%). ` +
    `${p.checkIns} check-ins · ${p.checkOuts} check-outs · ${p.turnovers} turnovers. ` +
    `${p.monthLabelStr} revenue ${fmtUsd(p.revenueMtd)} (check-in)${pickup} · ` +
    `${fmtUsd(p.revenueCreatedMtd)} (booked, Guesty Analytics parity). ` +
    `${p.reviewsCount} reviews this month · ${p.avgRating.toFixed(1)}★ avg${flag}.`
  );
}
