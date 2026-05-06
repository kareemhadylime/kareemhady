'use client';
import { useState } from 'react';
import { TopBar } from './top-bar';
import { LeftRail } from './left-rail';
import { HeroKpi } from './panels/hero-kpi';
import { usePerfUrlState } from '../_hooks/use-url-state';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';
import type { CompareMode } from '../_hooks/use-url-state';

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: CompareMode;
};

export function DashboardShell({
  payload,
  snapshotDate,
  generatedAt,
  initialBuilding: _initialBuilding,
  initialCompare: _initialCompare,
}: Props) {
  const { state, update } = usePerfUrlState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <TopBar
        state={state}
        generatedAt={generatedAt}
        reportDate={snapshotDate}
        hiddenCount={0}
        onCustomizeClick={() => setDrawerOpen(true)}
        onDateChange={(date) => update({ date })}
      />
      <div className="grid" style={{ gridTemplateColumns: '200px 1fr' }}>
        <LeftRail state={state} onChange={update} />
        <main className="grid grid-cols-12 gap-3 p-4 sm:p-5">
          {/* Hero KPI strip — wraps 2-up → 3-up → 6-up by viewport. min-w on each cell prevents crampness. */}
          <div className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <HeroKpi
              label="Occupancy"
              value={`${payload.all.occupancy_today_pct.toFixed(1)}%`}
              delta={{ direction: 'flat', text: 'today' }}
              drillTo="/beithady/analytics/performance"
            />
            <HeroKpi
              label="MTD Revenue"
              value={`$${(payload.all.revenue_mtd_usd / 1000).toFixed(1)}k`}
              delta={{ direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: `${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}% vs LM` }}
              drillTo="/beithady/financials?period=mtd"
              goldEdge
            />
            <HeroKpi
              label="ADR"
              value={`$${payload.all.adr_mtd_usd.toFixed(0)}`}
              delta={{ direction: 'flat', text: 'MTD avg' }}
              drillTo="/beithady/financials?metric=adr"
            />
            <HeroKpi
              label="Pace"
              value={`${payload.all.pickup_vs_prior_month_pct >= 0 ? '+' : ''}${payload.all.pickup_vs_prior_month_pct.toFixed(1)}%`}
              delta={{ direction: payload.all.pickup_vs_prior_month_pct >= 0 ? 'up' : 'down', text: 'vs prior month' }}
              drillTo={`/beithady/analytics/performance?date=${snapshotDate}&compare=last-month`}
            />
            <HeroKpi
              label="Reviews avg"
              value={`${payload.reviews.avg_rating_mtd.toFixed(1)}★`}
              delta={{ direction: 'flat', text: `${payload.reviews.count_mtd} reviews · ${payload.reviews.last_24h.filter((r) => r.flagged).length} flagged` }}
              drillTo="/beithady/analytics/reviews?period=mtd"
            />
            <HeroKpi
              label="Response time"
              value={payload.conversations ? `${payload.conversations.yesterday.avg_response_minutes.toFixed(0)}m` : '—'}
              delta={payload.conversations ? { direction: 'flat', text: `first ${payload.conversations.yesterday.first_response_avg_minutes.toFixed(0)}m` } : undefined}
              drillTo="/beithady/communication/unified?metric=response-time"
            />
          </div>
        </main>
      </div>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#003462]/40"
          onClick={() => setDrawerOpen(false)}
          role="presentation"
        >
          <div
            className="absolute right-0 top-0 h-full w-96 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Customize dashboard"
            aria-modal="true"
          >
            <p className="text-sm text-[#6077a6]">Customize drawer arrives in Phase 6.</p>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-3 rounded-md border border-[#003462] bg-[#003462] px-3 py-1.5 text-xs text-white hover:bg-[#003462]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
