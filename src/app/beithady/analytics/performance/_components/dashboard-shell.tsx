'use client';
import { useState, useEffect } from 'react';
import { TitleBar } from './title-bar';
import { LeftRail } from './left-rail';
import { useRailCollapse } from '../_hooks/use-rail-collapse';
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
import { CustomizeDrawer } from './customize-drawer';
import { MobileFilterSheet } from './mobile-filter-sheet';
import { useVisibility } from '../_hooks/use-visibility';
import { usePerfUrlState } from '../_hooks/use-url-state';
import type { BuildingCode, DailyReportPayload } from '@/lib/beithady-daily-report/types';
import type { CompareMode } from '../_hooks/use-url-state';

const BUILDING_CODE_SET: ReadonlySet<string> = new Set([
  'BH-26',
  'BH-73',
  'BH-435',
  'BH-OK',
  'OTHER',
]);

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: CompareMode;
  earliestDate: string | null;
};

export function DashboardShell({
  payload,
  snapshotDate,
  generatedAt,
  initialBuilding: _initialBuilding,
  initialCompare: _initialCompare,
  earliestDate,
}: Props) {
  const { state, update } = usePerfUrlState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { visibility, setPanel, hiddenCount } = useVisibility();
  const rail = useRailCollapse();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener('change', updateMobile);
    return () => mq.removeEventListener('change', updateMobile);
  }, []);

  const railColWidth = isMobile ? 0 : (rail.collapsed ? 44 : 200);

  // Active bucket: when the user picks a building from the rail, swap the
  // headline numbers (Hero KPIs + Daily activity) from portfolio totals to
  // that building's bucket. Falls back to portfolio when 'all' or unknown.
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

  return (
    <>
      {/* TitleBar — replaces old TopBar, navy gradient matching Fees Audit */}
      <TitleBar
        generatedAt={generatedAt}
        reportDate={snapshotDate}
        hiddenCount={hiddenCount}
        currentDate={snapshotDate}
        state={state}
        onCustomizeClick={() => setDrawerOpen(true)}
        onDateChange={(date) => update({ date })}
        onFilterClick={() => setMobileFilterOpen(true)}
      />

      {/* Body grid — rail + main content */}
      <div
        className="grid mt-6 transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
        style={{ gridTemplateColumns: `${railColWidth}px 1fr` }}
        onMouseEnter={isMobile ? undefined : rail.handleEnter}
        onMouseLeave={isMobile ? undefined : rail.handleLeave}
      >
        <div className={isMobile ? 'hidden' : ''}>
          <LeftRail
            state={state}
            onChange={update}
            snapshotDate={snapshotDate}
            collapsed={rail.collapsed}
            pinned={rail.pinned}
            onTogglePin={rail.togglePinned}
          />
        </div>
        <main className="grid grid-cols-12 gap-3 sm:gap-4">
          {isFiltered && (
            <div
              className="col-span-12 rounded-md px-3 py-2 text-[11px]"
              style={{
                background: '#fdf3da',
                color: '#7a5300',
                border: '1px solid #f1d889',
              }}
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

          {/* AI Insights tray (renders nothing when no insights) — full width */}
          {visibility['ai-insights'] && (
            <div className="col-span-12">
              <AIInsightsTray payload={payload} onHide={() => setPanel('ai-insights', false)} />
            </div>
          )}

          {/* Daily activity — top-of-fold operational strip (full width) */}
          {visibility['daily-activity'] && (
            <div className="col-span-12">
              <DailyActivity
                payload={payload}
                snapshotDate={snapshotDate}
                buildingFilter={buildingFilter}
                onHide={() => setPanel('daily-activity', false)}
              />
            </div>
          )}

          {/* Hero KPI strip — wraps 2-up → 3-up → 6-up by viewport */}
          <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {visibility['hero-occupancy'] && (
              <HeroKpi
                label={`Occupancy${filterSuffix}`}
                value={`${bucket.occupancy_today_pct.toFixed(1)}%`}
                delta={{ direction: 'flat', text: 'today' }}
                spark={isFiltered ? undefined : payload.sparklines?.occupancy}
                drillTo="/beithady/analytics/performance"
                accent="ink"
                onHide={() => setPanel('hero-occupancy', false)}
              />
            )}
            {visibility['hero-mtd-revenue'] && (
              <HeroKpi
                label={`MTD Revenue${filterSuffix}`}
                value={`$${(bucket.revenue_mtd_usd / 1000).toFixed(1)}k`}
                delta={{ direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: `${bucket.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${bucket.pickup_vs_prior_month_pct.toFixed(1)}% vs LM` }}
                spark={isFiltered ? undefined : payload.sparklines?.mtd_revenue}
                drillTo="/beithady/financials?period=mtd"
                accent="gold"
                onHide={() => setPanel('hero-mtd-revenue', false)}
              />
            )}
            {visibility['hero-revpar'] && (
              <HeroKpi
                label={`RevPAR${filterSuffix}`}
                value={revparValue != null ? `$${revparValue.toFixed(2)}` : `$${bucket.adr_mtd_usd.toFixed(0)}`}
                delta={revparValue != null ? { direction: 'flat', text: 'rev / available night' } : { direction: 'flat', text: 'ADR (RevPAR pending)' }}
                spark={isFiltered ? undefined : payload.sparklines?.revpar}
                drillTo="/beithady/financials?metric=revpar"
                accent="steel"
                onHide={() => setPanel('hero-revpar', false)}
              />
            )}
            {visibility['hero-pace'] && (
              <HeroKpi
                label={`Pace${filterSuffix}`}
                value={`${bucket.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${bucket.pickup_vs_prior_month_pct.toFixed(1)}%`}
                delta={{ direction: bucket.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'vs prior month' }}
                spark={isFiltered ? undefined : payload.sparklines?.pace}
                drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
                accent={paceAccent as 'green' | 'red'}
                onHide={() => setPanel('hero-pace', false)}
              />
            )}
            {visibility['hero-reviews-avg'] && (
              <HeroKpi
                label="Reviews avg"
                value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
                delta={{ direction: 'flat', text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged` }}
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
                delta={payload.conversations ? { direction: 'flat', text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m` } : undefined}
                spark={payload.sparklines?.response_time}
                drillTo="/beithady/communication/unified?metric=response-time"
                accent="steel"
                onHide={() => setPanel('hero-response-time', false)}
              />
            )}
          </div>

          {/* Buildings table (col-span-8) + Channel mix donut (col-span-4) */}
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

          {/* Payouts (col-span-4) + Reviews block (col-span-8) */}
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

          {/* Cleaning (c3) + SLA buckets (c6) + Check-ins/Cancellations (c3) */}
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

          {/* Top movers ribbon (full width) */}
          {visibility['top-movers'] && (
            <div className="col-span-12">
              <TopMoversRibbon payload={payload} onHide={() => setPanel('top-movers', false)} />
            </div>
          )}

          {/* Forward occupancy (c4) + Cancel risk (c4) + Monthly goal (c4) */}
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

          {/* Revenue concentration (c6) + Occupancy gap finder (c6) */}
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

          {/* Revenue waterfall (c6) + STLY YoY (c6) */}
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

          {/* Snapshot scrubber — full width, off by default */}
          {visibility['snapshot-scrubber'] && (
            <div className="col-span-12">
              <SnapshotScrubber
                currentDate={snapshotDate}
                earliestDate={earliestDate}
                onHide={() => setPanel('snapshot-scrubber', false)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Drawers / modals */}
      {drawerOpen && (
        <CustomizeDrawer
          onClose={() => setDrawerOpen(false)}
        />
      )}
      <MobileFilterSheet
        open={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        state={state}
        onChange={update}
        snapshotDate={snapshotDate}
      />
    </>
  );
}
