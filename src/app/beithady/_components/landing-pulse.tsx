import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { loadSnapshot, loadLatestSnapshotDate } from '@/app/beithady/analytics/performance/_lib/load-snapshot';
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

      <div
        className="grid grid-cols-2 gap-3 px-3 pb-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5"
        aria-label="Hero KPIs"
      >
        <HeroKpi
          label="Occupancy today"
          value={`${all.occupancy_today_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today' }}
          spark={payload.sparklines?.occupancy}
          drillTo="/beithady/analytics/performance"
          accent="ink"
        />
        <HeroKpi
          label="MTD Occupancy"
          value={`${all.backward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: '1st → today' }}
          spark={payload.sparklines?.mtd_occupancy}
          drillTo="/beithady/analytics/performance?metric=backward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month-to-End Occupancy"
          value={`${all.forward_occupancy_pct.toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'today → EOM, OTB' }}
          spark={payload.sparklines?.month_to_end_occupancy}
          drillTo="/beithady/analytics/performance?metric=forward-occupancy"
          accent="steel"
        />
        <HeroKpi
          label="Month Occupancy"
          value={`${(all.month_occupancy_pct ?? 0).toFixed(1)}%`}
          delta={{ direction: 'flat', text: 'whole month, OTB' }}
          spark={payload.sparklines?.month_occupancy}
          drillTo="/beithady/analytics/performance?metric=month-occupancy"
          accent="gold"
        />
        <HeroKpi
          label="Pace"
          value={`${all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${all.pickup_vs_prior_month_pct.toFixed(1)}%`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'vs prior month',
          }}
          spark={payload.sparklines?.pace}
          drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
          accent={paceAccent}
        />
        <HeroKpi
          label="MTD Revenue"
          value={`$${((all.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
          delta={{ direction: 'flat', text: 'check-ins so far' }}
          spark={payload.sparklines?.mtd_revenue_actual}
          drillTo="/beithady/financials?period=mtd-actual"
          accent="gold"
        />
        <HeroKpi
          label="Month Revenue (OTB)"
          value={`$${(all.revenue_mtd_usd / 1000).toFixed(1)}k`}
          delta={{
            direction: all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down',
            text: 'incl. confirmed → EOM',
          }}
          spark={payload.sparklines?.mtd_revenue}
          drillTo="/beithady/financials?period=month-otb"
          accent="gold"
        />
        <HeroKpi
          label="RevPAR"
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
          spark={payload.sparklines?.response_time}
          drillTo="/beithady/communication/unified?metric=response-time"
          accent="steel"
        />
      </div>
    </section>
  );
}
