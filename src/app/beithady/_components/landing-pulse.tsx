import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { loadSnapshot, loadLatestSnapshotDate, loadNearestSnapshot, computePriorDate } from '@/app/beithady/analytics/performance/_lib/load-snapshot';
import { DailyActivity } from '@/app/beithady/analytics/performance/_components/panels/daily-activity';
import { HeroKpi } from '@/app/beithady/analytics/performance/_components/panels/hero-kpi';
import { loadDailyActivityLive } from '@/lib/beithady/daily-activity-live';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

// Server component that surfaces a condensed snapshot of yesterday's
// performance on the Beit Hady landing. Same data as the Performance
// Dashboard's hero strip + Daily Activity panel — just static (no compare,
// no building filter, no customize, no date stepper). Acts as the cockpit's
// at-a-glance pulse: the user sees the day's numbers before deciding which
// module tile to dive into.
//
// Read-only and silent on missing data. If the snapshot table is empty or
// the latest row is malformed, this whole block disappears so it can't
// noise up the launcher.

export async function LandingPulse() {
  // Today's date in Cairo time — anchor for live activity.
  const today = cairoYmd();
  // Fetch in parallel: the latest snapshot (Hero KPIs / MTD context),
  // and TODAY's live daily-activity numbers from guesty_reservations.
  // The snapshot describes yesterday's completed period; the live query
  // gives "what's happening on the property right now" so the Daily
  // Activity strip's date label matches its data.
  const [result, latestDate, liveActivity] = await Promise.all([
    loadSnapshot(undefined),
    loadLatestSnapshotDate(),
    loadDailyActivityLive(today),
  ]);
  if (result.status !== 'found') {
    return (
      <section className="rounded-xl border border-slate-200/60 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-900/40 px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
        Today&apos;s pulse data is pending —{' '}
        <Link
          href="/beithady/setup"
          className="font-medium underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
        >
          rebuild from setup
        </Link>{' '}
        or wait for the 09:00 Cairo cron.
      </section>
    );
  }

  const { payload, date: snapshotDate } = result;

  // Always-on last-month anchor for the persistent MoM sub-line. Same logic
  // as the Performance page (see /analytics/performance/page.tsx).
  const lastMonthTarget = computePriorDate(snapshotDate, 'last-month');
  const lastMonthResult = lastMonthTarget ? await loadNearestSnapshot(lastMonthTarget, 5) : null;
  const lastMonthAll =
    lastMonthResult && lastMonthResult.status === 'found' ? lastMonthResult.payload.all : null;
  const lastMonthReviews =
    lastMonthResult && lastMonthResult.status === 'found' ? lastMonthResult.payload.reviews : null;
  const lastMonthConversations =
    lastMonthResult && lastMonthResult.status === 'found' ? lastMonthResult.payload.conversations : null;

  // Helpers for per-tile MoM sub-line. Render the *prior value itself* (not
  // the delta) with an arrow showing whether the current value is higher
  // (▲) or lower (▼). Hidden (undefined) when last-month is missing or
  // prior=0 (avoids meaningless "0 last month"). Match the Performance
  // page's momPp / momPct / momAbs helpers.
  function momPp(current: number, prior: number | null | undefined) {
    if (!lastMonthAll || prior == null) return undefined;
    const d = current - prior;
    const dir: 'up' | 'down' | 'flat' = Math.abs(d) < 0.05 ? 'flat' : d > 0 ? 'up' : 'down';
    return { direction: dir, text: `${prior.toFixed(1)}% last month` };
  }
  function momPct(
    current: number,
    prior: number | null | undefined,
    formatPrior: (v: number) => string,
    invert = false,
  ) {
    if (!lastMonthAll || prior == null) return undefined;
    const d = current - prior;
    const dir: 'up' | 'down' | 'flat' =
      Math.abs(d) < 0.5 ? 'flat' : invert ? (d > 0 ? 'down' : 'up') : d > 0 ? 'up' : 'down';
    return { direction: dir, text: `${formatPrior(prior)} last month` };
  }
  function momAbs(current: number, prior: number | null | undefined, unit: string, invert = false) {
    if (prior == null) return undefined;
    const d = current - prior;
    const dir: 'up' | 'down' | 'flat' =
      Math.abs(d) < 0.05 ? 'flat' : invert ? (d > 0 ? 'down' : 'up') : d > 0 ? 'up' : 'down';
    return { direction: dir, text: `${prior.toFixed(unit === '★' ? 1 : 0)}${unit} last month` };
  }
  // Shared formatter for $XX.Xk-style revenue values, so the prior-value
  // text matches the main value text on every revenue tile.
  const fmtUsdK = (v: number) => `$${(v / 1000).toFixed(1)}k`;

  // Synthesize a payload whose `all` and `per_building` daily-activity
  // fields point at TODAY's live numbers, while everything else (MTD
  // revenue, reviews, pace, AI insights, sparklines) keeps coming from
  // the snapshot. This lets DailyActivity render today's headline
  // numbers alongside the snapshot-driven Hero KPIs without rewriting
  // the panel components.
  const livePayload: DailyReportPayload = {
    ...payload,
    all: { ...payload.all, ...liveActivity.all },
    per_building: {
      'BH-26':  { ...payload.per_building['BH-26'],  ...liveActivity.per_building['BH-26']  },
      'BH-73':  { ...payload.per_building['BH-73'],  ...liveActivity.per_building['BH-73']  },
      'BH-435': { ...payload.per_building['BH-435'], ...liveActivity.per_building['BH-435'] },
      'BH-OK':  { ...payload.per_building['BH-OK'],  ...liveActivity.per_building['BH-OK']  },
      OTHER:    { ...payload.per_building.OTHER,     ...liveActivity.per_building.OTHER     },
    },
    // Flagged check-ins / cancellations / no-shows carry over from the
    // snapshot (sub-badges, not headlines — acceptable). Cleaning count
    // is overridden live via the cleaningCountOverride prop below.
  };
  // Use livePayload.all so the OCCUPANCY KPI card reflects the live
  // occupancy_today_pct (same source as the Currently Staying tile),
  // not the stale morning-cron snapshot value.
  const all = livePayload.all;
  const paceAccent: 'green' | 'red' = all.pickup_vs_prior_month_pct >= 0 ? 'green' : 'red';
  const isStale = latestDate && snapshotDate !== latestDate;

  return (
    <section
      aria-label="Today's pulse"
      className="rounded-xl shadow-sm"
      style={{
        background: 'var(--bh-cream)',
        border: '1px solid var(--bh-mute)',
      }}
    >
      <header className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--bh-steel)', fontWeight: 600 }}
          >
            ✨ Today&apos;s pulse
          </p>
          <span
            className="text-[10px]"
            style={{ color: 'var(--bh-steel)' }}
          >
            · {today} · activity live · KPIs from {snapshotDate}
            {isStale && latestDate && <span> (latest snapshot)</span>}
          </span>
        </div>
        <Link
          href={`/beithady/analytics/performance?date=${snapshotDate}`}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition motion-reduce:transition-none hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            background: 'var(--bh-ink)',
            color: 'var(--bh-cream)',
          }}
        >
          Open full dashboard <ArrowRight size={12} />
        </Link>
      </header>

      <div className="px-3 pb-3">
        <DailyActivity
          payload={livePayload}
          snapshotDate={today}
          cleaningCountOverride={liveActivity.all.check_outs_today}
          dxbCounts={liveActivity.dxb}
        />
      </div>

      {/* 4-col grid on lg+ → 11 tiles render as 4+4+3 (balanced, no orphan). */}
      <div
        className="grid grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4"
        aria-label="Hero KPIs"
      >
        <HeroKpi
          label="Occupancy today · EG"
          value={`${all.occupancy_today_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today' }}
          mom={momPp(all.occupancy_today_pct, lastMonthAll?.occupancy_today_pct)}
          spark={payload.sparklines?.occupancy}
          drillTo="/beithady/analytics/performance"
          accent="ink"
        />
        <HeroKpi
          label="MTD Occupancy · EG"
          value={`${all.backward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: '1st → today' }}
          mom={momPp(all.backward_occupancy_pct, lastMonthAll?.backward_occupancy_pct)}
          spark={payload.sparklines?.mtd_occupancy}
          drillTo="/beithady/analytics/performance?metric=backward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month-to-End Occupancy · EG"
          value={`${all.forward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today → EOM, OTB' }}
          mom={momPp(all.forward_occupancy_pct, lastMonthAll?.forward_occupancy_pct)}
          spark={payload.sparklines?.month_to_end_occupancy}
          drillTo="/beithady/analytics/performance?metric=forward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month Occupancy · EG"
          value={`${(all.month_occupancy_pct ?? 0).toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'whole month, OTB' }}
          mom={momPp(all.month_occupancy_pct ?? 0, lastMonthAll?.month_occupancy_pct)}
          spark={payload.sparklines?.month_occupancy}
          drillTo="/beithady/analytics/performance?metric=month-occupancy"
          accent="gold"
        />
        <HeroKpi
          label="Pace · EG"
          value={`${all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${all.pickup_vs_prior_month_pct.toFixed(1)}%`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'vs prior month',
          }}
          mom={momPp(all.pickup_vs_prior_month_pct, lastMonthAll?.pickup_vs_prior_month_pct)}
          spark={payload.sparklines?.pace}
          drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
          accent={paceAccent}
        />
        <HeroKpi
          label="MTD Revenue · EG"
          value={`$${((all.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
          delta={{ direction: 'flat', text: 'check-ins so far' }}
          mom={momPct(all.revenue_mtd_actual_usd ?? 0, lastMonthAll?.revenue_mtd_actual_usd, fmtUsdK)}
          spark={payload.sparklines?.mtd_revenue_actual}
          drillTo="/beithady/financials?period=mtd-actual"
          accent="gold"
        />
        <HeroKpi
          label="Month Revenue (OTB) · EG"
          value={`$${(all.revenue_mtd_usd / 1000).toFixed(1)}k`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'net payout · → EOM',
          }}
          mom={momPct(all.revenue_mtd_usd, lastMonthAll?.revenue_mtd_usd, fmtUsdK)}
          spark={payload.sparklines?.mtd_revenue}
          drillTo="/beithady/financials?period=month-otb"
          accent="gold"
        />
        <HeroKpi
          label="Month Revenue (Gross) · EG"
          value={`$${((all.revenue_mtd_gross_usd ?? 0) / 1000).toFixed(1)}k`}
          delta={{
            direction: 'flat',
            text: 'gross · matches Guesty',
          }}
          mom={momPct(all.revenue_mtd_gross_usd ?? 0, lastMonthAll?.revenue_mtd_gross_usd, fmtUsdK)}
          drillTo="/beithady/financials?period=month-otb"
          accent="gold"
        />
        <HeroKpi
          label="RevPAR · EG"
          value={
            payload.revpar?.all != null
              ? `$${payload.revpar.all.toFixed(2)}`
              : `$${all.adr_mtd_usd.toFixed(0)}`
          }
          delta={
            payload.revpar?.all != null
              ? { direction: 'flat', text: 'rev / available night' }
              : { direction: 'flat', text: 'ADR (RevPAR pending)' }
          }
          mom={payload.revpar?.all != null && lastMonthResult?.status === 'found' && lastMonthResult.payload.revpar?.all != null ? momPct(payload.revpar.all, lastMonthResult.payload.revpar.all, (v) => `$${v.toFixed(2)}`) : undefined}
          spark={payload.sparklines?.revpar}
          drillTo="/beithady/financials?metric=revpar"
          accent="steel"
        />
        <HeroKpi
          label="Reviews avg"
          value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
          delta={{
            direction: 'flat',
            text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged`,
          }}
          mom={lastMonthReviews ? momAbs(payload.reviews.avg_rating_mtd, lastMonthReviews.avg_rating_mtd, '★') : undefined}
          spark={payload.sparklines?.reviews_avg}
          drillTo="/beithady/analytics/reviews?period=mtd"
          accent="amber"
        />
        <HeroKpi
          label="Response time"
          value={
            payload.conversations
              ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m`
              : '—'
          }
          delta={
            payload.conversations
              ? {
                  direction: 'flat',
                  text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m`,
                }
              : undefined
          }
          mom={payload.conversations && lastMonthConversations ? momAbs(payload.conversations.yesterday.avg_response_minutes, lastMonthConversations.yesterday.avg_response_minutes, 'm', true) : undefined}
          spark={payload.sparklines?.response_time}
          drillTo="/beithady/communication/unified?metric=response-time"
          accent="steel"
        />
      </div>
    </section>
  );
}
