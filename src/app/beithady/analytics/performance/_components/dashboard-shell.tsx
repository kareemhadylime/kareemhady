'use client';
import { useState } from 'react';
import { Calendar, Building2, ArrowLeftRight, Settings } from 'lucide-react';
import Link from 'next/link';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  BHCustomizeDrawer,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { HeroKpi } from './panels/hero-kpi';
import { BuildingsTable } from './panels/buildings-table';
import { ChannelMixDonut } from './panels/channel-mix-donut';
import { Payouts } from './panels/payouts';
import { ReviewsBlock } from './panels/reviews-block';
import { CleaningTurnovers } from './panels/cleaning-turnovers';
import { InquirySlaBuckets } from './panels/inquiry-sla-buckets';
import { CheckInsPayment } from './panels/check-ins-payment';
import { Cancellations } from './panels/cancellations';
import { TopMoversRibbon } from './panels/top-movers-ribbon';
import { ForwardOccupancyBars } from './panels/forward-occupancy-bars';
import { CancelRisk } from './panels/cancel-risk';
import { RevenueConcentration } from './panels/revenue-concentration';
import { OccupancyGapFinder } from './panels/occupancy-gap-finder';
import { RevenueWaterfall } from './panels/revenue-waterfall';
import { StlyYoy } from './panels/stly-yoy';
import { MonthlyGoal } from './panels/monthly-goal';
import { AIInsightsTray } from './panels/ai-insights-tray';
import { DailyActivity } from './panels/daily-activity';
import { SnapshotScrubber } from './panels/snapshot-scrubber';
import { useVisibility } from '../_hooks/use-visibility';
import { usePerfUrlState, type CompareMode } from '../_hooks/use-url-state';
import { PANELS, PANEL_GROUPS, type PanelGroupId } from '../_lib/panel-registry';
import type { BuildingCode, DailyReportPayload } from '@/lib/beithady-daily-report/types';

const BUILDING_CODE_SET: ReadonlySet<string> = new Set([
  'BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER',
]);

const BUILDINGS = [
  { value: 'all', label: 'All' },
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
] as const;

const COMPARES = [
  { value: 'yesterday', label: 'vs Yesterday' },
  { value: 'last-week', label: 'vs Last Week' },
  { value: 'last-month', label: 'vs Last Month' },
  { value: 'last-year', label: 'vs Last Year' },
  { value: 'none', label: 'None' },
] as const;

const COMPARE_LABEL: Record<CompareMode, string> = {
  yesterday: 'vs yesterday',
  'last-week': 'vs last week',
  'last-month': 'vs last month',
  'last-year': 'vs last year',
  none: '',
};

const BUILDING_LABEL: Record<string, string> = {
  all: 'All buildings',
  'BH-26': 'BH-26',
  'BH-73': 'BH-73',
  'BH-435': 'BH-435',
  'BH-OK': 'BH-OK',
  OTHER: 'Other',
};

const COMPARE_CHIP_LABEL: Record<CompareMode, string> = {
  yesterday: 'vs Yesterday',
  'last-week': 'vs Last Week',
  'last-month': 'vs Last Month',
  'last-year': 'vs Last Year',
  none: 'No comparison',
};

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: CompareMode;
  earliestDate: string | null;
  latestDate: string | null;
  priorPayload: DailyReportPayload | null;
  priorDate: string | null;
  priorTargetDate: string | null;
  priorOffsetDays: number;
  /**
   * Same-day-last-month snapshot, independent of the compare-mode selector.
   * Used to render the persistent "▲ ±X% vs last month" sub-line under every
   * Hero KPI tile. Null when no neighbor snapshot exists within ±5 days.
   */
  lastMonthPayload: DailyReportPayload | null;
  lastMonthDate: string | null;
  dxbCounts?: { check_ins_today: number; check_outs_today: number; turnovers_today: number; occupied_today: number };
};

function ymdMinusOne(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

export function DashboardShell({
  payload,
  snapshotDate,
  generatedAt,
  initialBuilding: _initialBuilding,
  initialCompare: _initialCompare,
  earliestDate,
  latestDate,
  priorPayload,
  priorDate,
  priorTargetDate,
  priorOffsetDays,
  lastMonthPayload,
  lastMonthDate: _lastMonthDate,
  dxbCounts,
}: Props) {
  const { state, update } = usePerfUrlState();
  const rail = useRailCollapse();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const { visibility, setPanel, hiddenCount, reset } = useVisibility();

  // ---- Bucket & filter derivations (unchanged from previous implementation) ----
  const buildingFilter: BuildingCode | 'all' =
    BUILDING_CODE_SET.has(state.building) ? (state.building as BuildingCode) : 'all';
  const bucket = buildingFilter === 'all' ? payload.all : payload.per_building[buildingFilter];
  const isFiltered = buildingFilter !== 'all';
  const filterSuffix = isFiltered ? ` · ${buildingFilter}` : '';
  const paceAccent = bucket.pickup_vs_prior_month_pct >= 0 ? 'green' : 'red';
  const revparValue =
    isFiltered && payload.revpar?.by_building
      ? payload.revpar.by_building[buildingFilter as BuildingCode] ?? null
      : payload.revpar?.all ?? null;

  const priorBucket =
    priorPayload && (buildingFilter === 'all' ? priorPayload.all : priorPayload.per_building[buildingFilter]);
  // Bucket sliced from the same-day-last-month snapshot (independent of
  // compare mode). Drives the persistent MoM sub-line on every Hero KPI.
  const lastMonthBucket =
    lastMonthPayload && (buildingFilter === 'all' ? lastMonthPayload.all : lastMonthPayload.per_building[buildingFilter]);
  const priorRevpar = priorPayload?.revpar
    ? isFiltered && priorPayload.revpar.by_building
      ? priorPayload.revpar.by_building[buildingFilter as BuildingCode] ?? null
      : priorPayload.revpar.all ?? null
    : null;
  const compareLabel = COMPARE_LABEL[state.compare];
  const compareActive = state.compare !== 'none' && !!priorBucket;

  function ppDelta(current: number, prior: number, fallback: string) {
    if (!compareActive || prior === undefined || prior === null) {
      return { direction: 'flat' as const, text: fallback };
    }
    const d = current - prior;
    const sign = d > 0.05 ? '+' : '';
    return {
      direction: d > 0.05 ? ('up' as const) : d < -0.05 ? ('down' as const) : ('flat' as const),
      text: `${sign}${d.toFixed(1)}pp ${compareLabel}`,
    };
  }
  function pctDelta(current: number, prior: number, fallback: string) {
    if (!compareActive || !prior) {
      return { direction: 'flat' as const, text: fallback };
    }
    const pct = ((current - prior) / Math.abs(prior)) * 100;
    const sign = pct > 0.1 ? '+' : '';
    return {
      direction: pct > 0.1 ? ('up' as const) : pct < -0.1 ? ('down' as const) : ('flat' as const),
      text: `${sign}${pct.toFixed(1)}% ${compareLabel}`,
    };
  }
  function absDelta(current: number, prior: number, unit: string, fallback: string, invert = false) {
    if (!compareActive || prior === undefined || prior === null) {
      return { direction: 'flat' as const, text: fallback };
    }
    const d = current - prior;
    const sign = d > 0 ? '+' : '';
    const dir = d === 0 ? 'flat' : invert ? (d > 0 ? 'down' : 'up') : (d > 0 ? 'up' : 'down');
    return {
      direction: dir as 'up' | 'down' | 'flat',
      text: `${sign}${d.toFixed(unit === '★' ? 1 : 0)}${unit} ${compareLabel}`,
    };
  }

  // ---- Persistent MoM helpers (independent of compare-mode selector) ----
  // Each produces a small "▲ +X% vs last month" line for the HeroKpi `mom`
  // prop. When the last-month snapshot is missing or the prior value is 0,
  // returns undefined so the line is hidden entirely (vs showing a noisy
  // "+∞%" or "0% vs last month").
  function momPp(current: number, prior: number | undefined | null): { direction: 'up' | 'down' | 'flat'; text: string } | undefined {
    if (!lastMonthBucket || prior === undefined || prior === null) return undefined;
    const d = current - prior;
    if (Math.abs(d) < 0.05) return { direction: 'flat', text: `flat vs last month` };
    const sign = d > 0 ? '+' : '';
    return {
      direction: d > 0 ? 'up' : 'down',
      text: `${sign}${d.toFixed(1)}pp vs last month`,
    };
  }
  function momPct(current: number, prior: number | undefined | null, invert = false): { direction: 'up' | 'down' | 'flat'; text: string } | undefined {
    if (!lastMonthBucket || prior === undefined || prior === null || !prior) return undefined;
    const pct = ((current - prior) / Math.abs(prior)) * 100;
    if (Math.abs(pct) < 0.1) return { direction: 'flat', text: `flat vs last month` };
    const sign = pct > 0 ? '+' : '';
    const dir = invert ? (pct > 0 ? 'down' : 'up') : (pct > 0 ? 'up' : 'down');
    return {
      direction: dir as 'up' | 'down' | 'flat',
      text: `${sign}${pct.toFixed(1)}% vs last month`,
    };
  }
  function momAbs(current: number, prior: number | undefined | null, unit: string, invert = false): { direction: 'up' | 'down' | 'flat'; text: string } | undefined {
    if (!lastMonthPayload || prior === undefined || prior === null) return undefined;
    const d = current - prior;
    if (Math.abs(d) < 0.05) return { direction: 'flat', text: `flat vs last month` };
    const sign = d > 0 ? '+' : '';
    const dir = invert ? (d > 0 ? 'down' : 'up') : (d > 0 ? 'up' : 'down');
    return {
      direction: dir as 'up' | 'down' | 'flat',
      text: `${sign}${d.toFixed(unit === '★' ? 1 : 0)}${unit} vs last month`,
    };
  }

  // ---- Rail content (Period / Building / Compare sections, used both on desktop + mobile) ----
  const yesterdayYmd = ymdMinusOne(snapshotDate);
  const isYesterday = state.date === yesterdayYmd;
  const isToday = !state.date && !isYesterday;
  const isOtherDate = !!state.date && !isYesterday;

  const railSections: BHRailSection[] = [
    {
      title: 'Period',
      children: (
        <>
          <BHRailPill active={isToday} onClick={() => update({ date: undefined })}>Today</BHRailPill>
          <BHRailPill active={isYesterday} onClick={() => update({ date: yesterdayYmd })}>Yesterday</BHRailPill>
          <BHRailPill disabled title="Weekly aggregate not yet supported — use the snapshot scrubber for historical days.">
            This week <span style={{ opacity: 0.7 }}>· soon</span>
          </BHRailPill>
          {isOtherDate && (
            <BHRailPill active onClick={() => update({ date: undefined })} title="Click to return to latest">
              {state.date}
            </BHRailPill>
          )}
        </>
      ),
    },
    {
      title: 'Building',
      children: (
        <>
          {BUILDINGS.map((b) => (
            <BHRailPill key={b.value} active={state.building === b.value} onClick={() => update({ building: b.value })}>
              {b.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'Compare',
      children: (
        <>
          {COMPARES.map((c) => (
            <BHRailPill key={c.value} active={state.compare === c.value} onClick={() => update({ compare: c.value })}>
              {c.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
  ];

  const railCollapsedIcons = [
    { emoji: '📅', title: 'Period' },
    { emoji: '🏢', title: `Building: ${state.building}` },
    { emoji: '⇄', title: `Compare: ${state.compare}` },
  ];

  // ---- Title bar chips + actions ----
  const cairoTime = new Date(generatedAt).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit',
  });
  const dateLabel = new Date(snapshotDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
  const titleBarChips = [
    { icon: Calendar, label: `Data as of ${cairoTime} Cairo` },
    { icon: Building2, label: BUILDING_LABEL[state.building] ?? state.building },
    { icon: ArrowLeftRight, label: COMPARE_CHIP_LABEL[state.compare] ?? state.compare },
  ];

  const titleBarActions = (
    <>
      <Link
        href={`/api/beithady/perf/export-pdf${snapshotDate ? `?date=${snapshotDate}` : ''}`}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
        aria-label="Export current snapshot as PDF"
      >
        ⤓ Export PDF
      </Link>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--bh-gold)', color: 'var(--bh-ink)' }}
      >
        <Settings size={11} className="inline mr-1" />
        Customize{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
      </button>
    </>
  );

  // ---- Customize drawer content (panel checkboxes) ----
  const groups = Object.keys(PANEL_GROUPS) as PanelGroupId[];
  const customizeBody = (
    <>
      {groups.map((groupId) => {
        const groupPanels = PANELS.filter((p) => p.group === groupId);
        if (groupPanels.length === 0) return null;
        return (
          <section key={groupId} className="mb-5">
            <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--bh-steel)' }}>
              {PANEL_GROUPS[groupId]}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {groupPanels.map((p) => (
                <li key={p.id}>
                  <label
                    htmlFor={`vis-${p.id}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-[12px] cursor-pointer hover:opacity-90"
                    style={{ borderColor: 'var(--bh-mute)', background: 'var(--bh-cream)', color: 'var(--bh-ink)' }}
                  >
                    <span>{p.label}</span>
                    <span className="relative inline-flex">
                      <input
                        id={`vis-${p.id}`}
                        type="checkbox"
                        checked={visibility[p.id]}
                        onChange={(e) => setPanel(p.id, e.target.checked)}
                        className="peer h-5 w-9 cursor-pointer appearance-none rounded-full bg-[#eae9f3] outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 checked:bg-[#003462]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none peer-checked:translate-x-4"
                      />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );

  const customizeFooter = (
    <>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border px-3 py-1.5 text-xs hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ borderColor: 'var(--bh-mute)', background: 'var(--bh-cream)', color: 'var(--bh-ink)' }}
      >
        Reset to default
      </button>
      <button
        type="button"
        onClick={() => setDrawerOpen(false)}
        className="rounded-md px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'var(--bh-ink)', color: 'var(--bh-cream)' }}
      >
        Done
      </button>
    </>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Performance Dashboard"
          title={`${dateLabel} · Snapshot`}
          chips={titleBarChips}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={railCollapsedIcons}
          pinned={rail.pinned}
          onTogglePin={rail.togglePinned}
        />
      }
      mobileFilterSheet={
        <BHMobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)}>
          <BHLeftRail sections={railSections} />
        </BHMobileFilterSheet>
      }
      drawer={
        <BHCustomizeDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Customize"
          ariaLabel="Customize dashboard"
          footer={customizeFooter}
        >
          {customizeBody}
        </BHCustomizeDrawer>
      }
    >
      {/* === BANNERS === */}
      {isFiltered && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#fdf3da', color: '#7a5300', border: '1px solid #f1d889' }}
          role="status"
        >
          Filtered to <strong>{buildingFilter}</strong> — Hero KPIs and Daily activity show {buildingFilter} only.
          Channel mix, payouts, reviews, and other portfolio panels show all-portfolio data.{' '}
          <button
            type="button"
            onClick={() => update({ building: 'all' })}
            className="underline hover:opacity-80"
            style={{ color: '#7a5300' }}
          >
            Clear filter
          </button>
        </div>
      )}

      {compareActive && priorDate && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#eef3fb', color: 'var(--bh-ink)', border: '1px solid var(--bh-mute)' }}
          role="status"
        >
          Comparing <strong>{snapshotDate}</strong> {compareLabel} (<strong>{priorDate}</strong>
          {priorOffsetDays !== 0 && priorTargetDate && (
            <span style={{ color: 'var(--bh-steel)' }}>
              {' '}— nearest available, {Math.abs(priorOffsetDays)} day{Math.abs(priorOffsetDays) === 1 ? '' : 's'}{' '}
              {priorOffsetDays > 0 ? 'before' : 'after'} target {priorTargetDate}
            </span>
          )}
          ) — Hero KPIs show ▲/▼ deltas.{' '}
          <button
            type="button"
            onClick={() => update({ compare: 'none' })}
            className="underline hover:opacity-80"
            style={{ color: 'var(--bh-ink)' }}
          >
            Clear compare
          </button>
        </div>
      )}
      {state.compare !== 'none' && !priorPayload && priorTargetDate && (
        <div
          className="col-span-12 rounded-md px-3 py-2 text-[11px]"
          style={{ background: '#fdecec', color: '#9a2828', border: '1px solid #f1bcbc' }}
          role="status"
        >
          Compare {COMPARE_LABEL[state.compare]}: no well-formed snapshot in the ±3-day window around{' '}
          <strong>{priorTargetDate}</strong> — deltas hidden.{' '}
          <button
            type="button"
            onClick={() => update({ compare: 'none' })}
            className="underline hover:opacity-80"
            style={{ color: '#9a2828' }}
          >
            Clear compare
          </button>
        </div>
      )}

      {/* === PANELS === */}
      {visibility['ai-insights'] && (
        <div className="col-span-12">
          <AIInsightsTray payload={payload} onHide={() => setPanel('ai-insights', false)} />
        </div>
      )}

      {visibility['daily-activity'] && (
        <div className="col-span-12">
          <DailyActivity
            payload={payload}
            snapshotDate={snapshotDate}
            buildingFilter={buildingFilter}
            latestDate={latestDate}
            dxbCounts={dxbCounts}
            onDateChange={(d) =>
              update({ date: latestDate && d === latestDate ? undefined : d })
            }
            onHide={() => setPanel('daily-activity', false)}
          />
        </div>
      )}

      {/* Grid: 4-col on xl gives a balanced 4+4+(3|4) layout for 11–12 hero tiles
          (vs the old 5-col which left a single orphan tile in row 3). */}
      <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
        {visibility['hero-occupancy'] && (
          <HeroKpi
            label={`Occupancy today${filterSuffix}`}
            value={`${bucket.occupancy_today_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.occupancy_today_pct, priorBucket.occupancy_today_pct, 'today') : { direction: 'flat', text: 'today' }}
            mom={momPp(bucket.occupancy_today_pct, lastMonthBucket?.occupancy_today_pct)}
            spark={isFiltered ? undefined : payload.sparklines?.occupancy}
            drillTo="/beithady/analytics/performance"
            accent="ink"
            onHide={() => setPanel('hero-occupancy', false)}
          />
        )}
        {visibility['hero-mtd-occupancy'] && (
          <HeroKpi
            label={`MTD Occupancy${filterSuffix}`}
            value={`${bucket.backward_occupancy_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.backward_occupancy_pct, priorBucket.backward_occupancy_pct, '1st → today') : { direction: 'flat', text: '1st → today' }}
            mom={momPp(bucket.backward_occupancy_pct, lastMonthBucket?.backward_occupancy_pct)}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_occupancy}
            drillTo="/beithady/analytics/performance?metric=backward-occupancy"
            accent="steel"
            onHide={() => setPanel('hero-mtd-occupancy', false)}
          />
        )}
        {visibility['hero-month-to-end-occupancy'] && (
          <HeroKpi
            label={`Month-to-End Occupancy${filterSuffix}`}
            value={`${bucket.forward_occupancy_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.forward_occupancy_pct, priorBucket.forward_occupancy_pct, 'today → EOM, OTB') : { direction: 'flat', text: 'today → EOM, OTB' }}
            mom={momPp(bucket.forward_occupancy_pct, lastMonthBucket?.forward_occupancy_pct)}
            spark={isFiltered ? undefined : payload.sparklines?.month_to_end_occupancy}
            drillTo="/beithady/analytics/performance?metric=forward-occupancy"
            accent="steel"
            onHide={() => setPanel('hero-month-to-end-occupancy', false)}
          />
        )}
        {visibility['hero-month-occupancy'] && (
          <HeroKpi
            label={`Month Occupancy${filterSuffix}`}
            value={`${(bucket.month_occupancy_pct ?? 0).toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta((bucket.month_occupancy_pct ?? 0), (priorBucket.month_occupancy_pct ?? 0), 'whole month, OTB') : { direction: 'flat', text: 'whole month, OTB' }}
            mom={momPp(bucket.month_occupancy_pct ?? 0, lastMonthBucket?.month_occupancy_pct)}
            spark={isFiltered ? undefined : payload.sparklines?.month_occupancy}
            drillTo="/beithady/analytics/performance?metric=month-occupancy"
            accent="gold"
            onHide={() => setPanel('hero-month-occupancy', false)}
          />
        )}
        {visibility['hero-pace'] && (
          <HeroKpi
            label={`Pace${filterSuffix}`}
            value={`${bucket.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${bucket.pickup_vs_prior_month_pct.toFixed(1)}%`}
            delta={compareActive && priorBucket ? ppDelta(bucket.pickup_vs_prior_month_pct, priorBucket.pickup_vs_prior_month_pct, 'vs prior month') : { direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'vs prior month' }}
            mom={momPp(bucket.pickup_vs_prior_month_pct, lastMonthBucket?.pickup_vs_prior_month_pct)}
            spark={isFiltered ? undefined : payload.sparklines?.pace}
            drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
            accent={paceAccent as 'green' | 'red'}
            onHide={() => setPanel('hero-pace', false)}
          />
        )}
        {visibility['hero-mtd-revenue-actual'] && (
          <HeroKpi
            label={`MTD Revenue${filterSuffix}`}
            value={`$${((bucket.revenue_mtd_actual_usd ?? 0) / 1000).toFixed(1)}k`}
            delta={compareActive && priorBucket ? pctDelta((bucket.revenue_mtd_actual_usd ?? 0), (priorBucket.revenue_mtd_actual_usd ?? 0), 'check-ins so far') : { direction: 'flat', text: 'check-ins so far' }}
            mom={momPct(bucket.revenue_mtd_actual_usd ?? 0, lastMonthBucket?.revenue_mtd_actual_usd)}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue_actual}
            drillTo="/beithady/financials?period=mtd-actual"
            accent="gold"
            onHide={() => setPanel('hero-mtd-revenue-actual', false)}
          />
        )}
        {visibility['hero-mtd-revenue'] && (
          <HeroKpi
            label={`Month Revenue (OTB)${filterSuffix}`}
            value={`$${(bucket.revenue_mtd_usd / 1000).toFixed(1)}k`}
            delta={compareActive && priorBucket ? pctDelta(bucket.revenue_mtd_usd, priorBucket.revenue_mtd_usd, 'net payout · → EOM') : { direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'net payout · → EOM' }}
            mom={momPct(bucket.revenue_mtd_usd, lastMonthBucket?.revenue_mtd_usd)}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue}
            drillTo="/beithady/financials?period=month-otb"
            accent="gold"
            onHide={() => setPanel('hero-mtd-revenue', false)}
          />
        )}
        {visibility['hero-mtd-revenue-gross'] && (
          <HeroKpi
            label={`Month Revenue (Gross)${filterSuffix}`}
            value={`$${((bucket.revenue_mtd_gross_usd ?? 0) / 1000).toFixed(1)}k`}
            delta={compareActive && priorBucket ? pctDelta(bucket.revenue_mtd_gross_usd ?? 0, priorBucket.revenue_mtd_gross_usd ?? 0, 'gross · matches Guesty') : { direction: 'flat', text: 'gross · matches Guesty' }}
            mom={momPct(bucket.revenue_mtd_gross_usd ?? 0, lastMonthBucket?.revenue_mtd_gross_usd)}
            spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue}
            drillTo="/beithady/financials?period=month-otb"
            accent="gold"
            onHide={() => setPanel('hero-mtd-revenue-gross', false)}
          />
        )}
        {visibility['hero-revpar'] && (
          <HeroKpi
            label={`RevPAR${filterSuffix}`}
            value={revparValue != null ? `$${revparValue.toFixed(2)}` : `$${bucket.adr_mtd_usd.toFixed(0)}`}
            delta={
              compareActive && revparValue != null && priorRevpar != null
                ? pctDelta(revparValue, priorRevpar, 'rev / available night')
                : revparValue != null
                  ? { direction: 'flat', text: 'rev / available night' }
                  : { direction: 'flat', text: 'ADR (RevPAR pending)' }
            }
            mom={revparValue != null && lastMonthPayload?.revpar ? momPct(
              revparValue,
              (isFiltered && lastMonthPayload.revpar.by_building)
                ? (lastMonthPayload.revpar.by_building[buildingFilter as BuildingCode] ?? null)
                : lastMonthPayload.revpar.all ?? null,
            ) : undefined}
            spark={isFiltered ? undefined : payload.sparklines?.revpar}
            drillTo="/beithady/financials?metric=revpar"
            accent="steel"
            onHide={() => setPanel('hero-revpar', false)}
          />
        )}
        {visibility['hero-reviews-avg'] && (
          <HeroKpi
            label="Reviews avg"
            value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
            delta={
              compareActive && priorPayload
                ? absDelta(payload.reviews.avg_rating_mtd, priorPayload.reviews.avg_rating_mtd, '★', `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged`)
                : { direction: 'flat', text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged` }
            }
            mom={lastMonthPayload?.reviews ? momAbs(payload.reviews.avg_rating_mtd, lastMonthPayload.reviews.avg_rating_mtd, '★') : undefined}
            spark={payload.sparklines?.reviews_avg}
            drillTo="/beithady/analytics/reviews?period=mtd"
            accent="amber"
            onHide={() => setPanel('hero-reviews-avg', false)}
          />
        )}
        {visibility['hero-response-time'] && (
          <HeroKpi
            label="Response time"
            value={payload.conversations ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m` : '—'}
            delta={
              compareActive && payload.conversations && priorPayload?.conversations
                ? absDelta(payload.conversations.yesterday.avg_response_minutes, priorPayload.conversations.yesterday.avg_response_minutes, 'm', `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m`, true)
                : payload.conversations
                  ? { direction: 'flat', text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m` }
                  : undefined
            }
            mom={payload.conversations && lastMonthPayload?.conversations ? momAbs(payload.conversations.yesterday.avg_response_minutes, lastMonthPayload.conversations.yesterday.avg_response_minutes, 'm', true) : undefined}
            spark={payload.sparklines?.response_time}
            drillTo="/beithady/communication/unified?metric=response-time"
            accent="steel"
            onHide={() => setPanel('hero-response-time', false)}
          />
        )}
      </div>

      {visibility['buildings-table'] && (
        <div className="col-span-12 lg:col-span-8">
          <BuildingsTable payload={payload} onHide={() => setPanel('buildings-table', false)} />
        </div>
      )}
      {visibility['channel-mix'] && (
        <div className="col-span-12 lg:col-span-4">
          <ChannelMixDonut payload={payload} onHide={() => setPanel('channel-mix', false)} />
        </div>
      )}

      {visibility['payouts'] && (
        <div className="col-span-12 lg:col-span-4">
          <Payouts payload={payload} onHide={() => setPanel('payouts', false)} />
        </div>
      )}
      {visibility['reviews-block'] && (
        <div className="col-span-12 lg:col-span-8">
          <ReviewsBlock payload={payload} onHide={() => setPanel('reviews-block', false)} />
        </div>
      )}

      {visibility['cleaning-turnovers'] && (
        <div className="col-span-12 lg:col-span-3">
          <CleaningTurnovers payload={payload} onHide={() => setPanel('cleaning-turnovers', false)} />
        </div>
      )}
      {visibility['inquiry-sla'] && (
        <div className="col-span-12 lg:col-span-6">
          <InquirySlaBuckets payload={payload} onHide={() => setPanel('inquiry-sla', false)} />
        </div>
      )}
      {(visibility['check-ins-payment'] || visibility['cancellations']) && (
        <div className="col-span-12 lg:col-span-3 grid grid-rows-2 gap-3">
          {visibility['check-ins-payment'] && (
            <CheckInsPayment payload={payload} onHide={() => setPanel('check-ins-payment', false)} />
          )}
          {visibility['cancellations'] && (
            <Cancellations payload={payload} onHide={() => setPanel('cancellations', false)} />
          )}
        </div>
      )}

      {visibility['top-movers'] && (
        <div className="col-span-12">
          <TopMoversRibbon payload={payload} onHide={() => setPanel('top-movers', false)} />
        </div>
      )}

      {visibility['forward-occupancy'] && (
        <div className="col-span-12 lg:col-span-4">
          <ForwardOccupancyBars payload={payload} onHide={() => setPanel('forward-occupancy', false)} />
        </div>
      )}
      {visibility['cancel-risk'] && (
        <div className="col-span-12 lg:col-span-4">
          <CancelRisk payload={payload} onHide={() => setPanel('cancel-risk', false)} />
        </div>
      )}
      {visibility['monthly-goal'] && (
        <div className="col-span-12 lg:col-span-4">
          <MonthlyGoal payload={payload} onHide={() => setPanel('monthly-goal', false)} />
        </div>
      )}

      {visibility['revenue-concentration'] && (
        <div className="col-span-12 lg:col-span-6">
          <RevenueConcentration payload={payload} onHide={() => setPanel('revenue-concentration', false)} />
        </div>
      )}
      {visibility['occupancy-gap-finder'] && (
        <div className="col-span-12 lg:col-span-6">
          <OccupancyGapFinder payload={payload} onHide={() => setPanel('occupancy-gap-finder', false)} />
        </div>
      )}

      {visibility['revenue-waterfall'] && (
        <div className="col-span-12 lg:col-span-6">
          <RevenueWaterfall payload={payload} onHide={() => setPanel('revenue-waterfall', false)} />
        </div>
      )}
      {visibility['stly-yoy'] && (
        <div className="col-span-12 lg:col-span-6">
          <StlyYoy payload={payload} onHide={() => setPanel('stly-yoy', false)} />
        </div>
      )}

      {visibility['snapshot-scrubber'] && (
        <div className="col-span-12">
          <SnapshotScrubber currentDate={snapshotDate} earliestDate={earliestDate} onHide={() => setPanel('snapshot-scrubber', false)} />
        </div>
      )}
    </BHDashboardShell>
  );
}
