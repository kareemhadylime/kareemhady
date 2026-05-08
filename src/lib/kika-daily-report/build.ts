import 'server-only';
import {
  cairoYmd,
  reportDateLabel,
  monthLabel,
  yesterday as yesterdayOf,
  addDays,
  weekdayName,
  isSunday,
  priorWeekday,
  priorMonthSameWindow,
  priorYearSameDay,
} from './cairo-dates';
import { loadKikaCorpus, type KikaCorpus } from './corpus';
import { buildTopline, buildSparklines, revenueHistory14d } from './build-topline';
import { buildTopProducts } from './build-products';
import { buildInventorySection } from './build-inventory';
import { buildAbandonedSection } from './build-abandoned';
import { buildFulfillmentSection } from './build-fulfillment';
import { buildDiscountSection } from './build-discounts';
import { buildGeoSection } from './build-geo';
import { buildWeeklyDigest } from './build-weekly';
import { detectAnomalies } from './anomaly';
import { composeOneliner } from './oneliner';
import { composeWhyAttribution } from './why';
import type { KikaDailyPayload } from './types';

// Orchestrator. One entry point; called by both the cron tick and the
// "Send Test Now" admin button. Loads the 60-day corpus once, runs every
// section builder, composes the digest oneliner + anomaly banner +
// why-attribution, and returns a fully-built payload.
//
// Build order:
//   1. Resolve dates (yesterday, prior windows, weekday)
//   2. Load 60-day corpus (one Supabase trip; orders + lines + customers + abandoned)
//   3. Optionally load YoY corpus (prior year same day, ±5 days)
//   4. Run all section builders (parallel where async)
//   5. Compose anomaly + oneliner + why
//   6. Return KikaDailyPayload

const REPORT_TIMEZONE_LABEL = '09:00 Cairo';

export async function buildKikaDailyReport(
  reportDateYmd?: string
): Promise<KikaDailyPayload> {
  // Date semantics — same as Beithady v2: report runs at 09:00 Cairo
  // "today" and DESCRIBES yesterday's full 24h. So `today` = generation day,
  // `yesterday` = the day the data covers.
  const generationDate = reportDateYmd || cairoYmd();
  const yesterdayDate = yesterdayOf(generationDate);
  const priorDay = addDays(yesterdayDate, -1);
  const priorWk = priorWeekday(yesterdayDate);
  const priorMonthMtd = priorMonthSameWindow(yesterdayDate);
  const priorYr = priorYearSameDay(yesterdayDate);
  const weekday = weekdayName(yesterdayDate);
  const generatedAt = new Date();
  const monthName = monthLabel(yesterdayDate);
  const isoDate = generatedAt.toISOString();
  const isSundayDigest = isSunday(yesterdayDate);

  // ---- Load corpus (60-day window) ----
  const corpus = await loadKikaCorpus(yesterdayDate);

  const buildWarnings: string[] = [];
  if (corpus.skipped_non_egp > 0) {
    buildWarnings.push(
      `skipped ${corpus.skipped_non_egp} non-EGP order${corpus.skipped_non_egp === 1 ? '' : 's'} during build`
    );
  }

  // ---- Optional YoY corpus (small, prior year same day ±5 days) ----
  let yearAgoCorpus: KikaCorpus | null = null;
  if (priorYr) {
    try {
      // Cheap reload — only need a tight window around priorYr.
      // Reuses the same corpus loader but with a short virtual "yesterday".
      yearAgoCorpus = await loadKikaCorpus(priorYr);
    } catch (e) {
      buildWarnings.push(
        `yoy_load_failed: ${e instanceof Error ? e.message : String(e)}`
      );
      yearAgoCorpus = null;
    }
  }

  // ---- Section builders ----
  // Topline + products + sparklines are sync (in-memory only).
  const topline = buildTopline({
    corpus,
    yesterday: yesterdayDate,
    priorDay,
    priorWeekday: priorWk,
    priorMonthMtd,
    priorYear: priorYr,
    yearAgoCorpus,
  });

  const sparklines = buildSparklines(corpus, yesterdayDate);

  const topProducts = buildTopProducts({
    corpus,
    yesterday: yesterdayDate,
    yesterdayNetRevenue: topline.net_revenue_egp,
  });

  const fulfillment = buildFulfillmentSection({
    corpus,
    yesterday: yesterdayDate,
  });

  const discounts = buildDiscountSection({
    corpus,
    yesterday: yesterdayDate,
    yesterdayGross: topline.gross_revenue_egp,
  });

  const geo = buildGeoSection({ corpus, yesterday: yesterdayDate });

  // Inventory + abandoned each issue an extra DB query — run in parallel.
  const [inventory, abandoned] = await Promise.all([
    buildInventorySection(corpus, yesterdayDate),
    buildAbandonedSection({
      abandonedYesterday: corpus.abandoned_yesterday,
      yesterdayYmd: yesterdayDate,
    }),
  ]);

  // Weekly digest (Sunday only)
  let weekly_digest;
  if (isSundayDigest) {
    weekly_digest = buildWeeklyDigest({
      corpus,
      yesterday: yesterdayDate,
      weekStart: addDays(yesterdayDate, -6),
      weekDaysElapsed: 7,
    });
  }

  // ---- Anomaly + oneliner + why ----
  const anomalies = detectAnomalies({
    topline,
    inventory,
    discounts,
    topProducts,
    revenueHistory14d: revenueHistory14d(sparklines),
  });

  const digest_oneliner = composeOneliner({
    weekday,
    topline,
  });

  const why = composeWhyAttribution({
    topline,
    topProducts,
  });

  // ---- Header label ----
  // Lead with TODAY (when the recipient gets the report); data date is the
  // explanatory subline. Mirrors the Beithady daily report convention.
  const generated_at_cairo =
    `${reportDateLabel(generationDate)} · Reporting on ${reportDateLabel(yesterdayDate)} (yesterday) · ${REPORT_TIMEZONE_LABEL}`;

  return {
    report_date: yesterdayDate,
    generated_at_iso: isoDate,
    generated_at_cairo,
    generation_date: generationDate,
    weekday_label: weekday,
    is_sunday_digest: isSundayDigest,
    month_label: monthName,
    digest_oneliner,
    anomalies,
    why,
    topline,
    sparklines,
    top_products: topProducts,
    inventory,
    abandoned,
    fulfillment,
    discounts,
    geo,
    weekly_digest,
    build_warnings: buildWarnings,
    currency: 'EGP',
  };
}
