import { Suspense } from 'react';
import { PeriodFilter } from './_components/period-filter';
import { AccountFilter } from './_components/account-filter';
import { KpiTile, fmtEgp } from './_components/kpi-tile';
import { HoldingsTable } from './_components/holdings-table';
import { ActivityFeed } from './_components/activity-feed';
import {
  getDashboardKpis,
  getTopHoldings,
  getRecentActivity,
  getDividendsByYear,
  getAccountBalanceSeries,
  getPortfolioCostSeries,
} from '@/lib/personal/stocks/queries';
import { PortfolioChart } from './_components/portfolio-chart';
import { DividendsChart } from './_components/dividends-chart';
import { BalanceLinesChart } from './_components/balance-lines-chart';
import { RealizedPnlChart } from './_components/realized-pnl-chart';
import type { Period, AccountCode } from '@/lib/personal/stocks/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period; account?: AccountCode | 'all' }>;
}) {
  const sp = await searchParams;
  const period: Period = sp.period ?? 'all';
  const account = sp.account ?? 'all';
  const [k, holdings, activity, portfolioSeries, balanceSeries, divsByYear] =
    await Promise.all([
      getDashboardKpis({ period, account }),
      getTopHoldings(10),
      getRecentActivity(8),
      getPortfolioCostSeries(),
      getAccountBalanceSeries(),
      getDividendsByYear(),
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Period
          </div>
          <Suspense>
            <PeriodFilter />
          </Suspense>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            Account
          </div>
          <Suspense>
            <AccountFilter />
          </Suspense>
        </div>
      </div>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
          Money Flow & Trading
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            label="Cash In (from bank)"
            tone="pos"
            value={fmtEgp(k.cashInEgp, { compact: true })}
            sub="EGP"
          />
          <KpiTile
            label="Cash Out (to bank)"
            tone="neg"
            value={fmtEgp(k.cashOutEgp, { compact: true })}
            sub="EGP"
          />
          <KpiTile
            label="Total Bought"
            value={fmtEgp(k.totalBoughtEgp, { compact: true })}
            sub="EGP · buys"
          />
          <KpiTile
            label="Total Sold"
            value={fmtEgp(k.totalSoldEgp, { compact: true })}
            sub="EGP · sells"
          />
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
          Position & Returns
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            label="Open Positions Cost"
            value={fmtEgp(k.openPositionsCostEgp, { compact: true })}
            sub="EGP · avg cost"
          />
          <KpiTile
            label="Dividends Earned"
            tone="pos"
            value={fmtEgp(k.dividendsEgp, { compact: true })}
            sub="EGP"
          />
          <KpiTile
            label="Realized P&L"
            tone={k.realizedPnlEgp >= 0 ? 'pos' : 'neg'}
            value={fmtEgp(k.realizedPnlEgp, { compact: true })}
            sub="FIFO matched (pending Task 22)"
          />
          <KpiTile
            label="Unrealized P&L"
            tone={k.unrealizedPnlEgp >= 0 ? 'pos' : 'neg'}
            value={fmtEgp(k.unrealizedPnlEgp, { compact: true })}
            sub="vs last manual prices"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <HoldingsTable rows={holdings} />
        </div>
        <div>
          <ActivityFeed rows={activity} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PortfolioChart data={portfolioSeries} />
        <BalanceLinesChart data={balanceSeries} />
        <DividendsChart data={divsByYear} />
        <RealizedPnlChart data={[]} />
      </div>
    </div>
  );
}
