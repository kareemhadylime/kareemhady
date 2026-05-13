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
  getRealizedPnlByYear,
  getCapitalSummary,
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
  const [
    k,
    cap,
    holdings,
    activity,
    portfolioSeries,
    balanceSeries,
    divsByYear,
    realizedByYear,
  ] = await Promise.all([
    getDashboardKpis({ period, account }),
    getCapitalSummary(),
    getTopHoldings(10),
    getRecentActivity(8),
    getPortfolioCostSeries(),
    getAccountBalanceSeries(),
    getDividendsByYear(),
    getRealizedPnlByYear(),
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
          My Money Now
          <span className="ml-2 text-slate-400 normal-case tracking-normal">
            current snapshot · {cap.perAccount[0]?.asOf ?? '—'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            label="My Equity"
            tone={cap.myEquityEgp >= 0 ? 'pos' : 'neg'}
            value={fmtEgp(cap.myEquityEgp, { compact: true })}
            sub="cash + stocks at cost"
          />
          <KpiTile
            label="Stocks Held"
            value={fmtEgp(cap.stocksAtCostEgp, { compact: true })}
            sub="EGP · avg cost"
          />
          <KpiTile
            label="Margin Loan"
            tone={cap.marginLoanEgp > 0 ? 'neg' : 'neutral'}
            value={fmtEgp(cap.marginLoanEgp, { compact: true })}
            sub={
              cap.marginRatioPct !== null
                ? `${cap.marginRatioPct.toFixed(1)}% of stocks`
                : 'no margin'
            }
          />
          <KpiTile
            label="Cash on Hand"
            tone="pos"
            value={fmtEgp(cap.cashOnHandEgp, { compact: true })}
            sub="positive balances"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          {cap.perAccount.map((s) => (
            <div
              key={s.accountId}
              className="ix-card p-2 text-[11px]"
            >
              <div className="flex justify-between items-baseline">
                <span className="text-slate-500 uppercase text-[10px] tracking-wide">
                  Account {s.accountCode}
                </span>
                <span className="text-slate-400 text-[10px]">
                  {s.asOf ?? '—'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                <div>
                  <div className="text-[9px] text-slate-400">cash</div>
                  <div
                    className={
                      s.cashEgp < 0 ? 'text-rose-700' : 'text-slate-800 dark:text-slate-200'
                    }
                  >
                    {fmtEgp(s.cashEgp, { compact: true })}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400">stocks</div>
                  <div>{fmtEgp(s.stocksAtCostEgp, { compact: true })}</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400">equity</div>
                  <div
                    className={
                      s.equityEgp < 0
                        ? 'text-rose-700'
                        : 'text-emerald-700 font-semibold'
                    }
                  >
                    {fmtEgp(s.equityEgp, { compact: true })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
          Returns & Costs
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            label="Dividends Earned"
            tone="pos"
            value={fmtEgp(k.dividendsEgp, { compact: true })}
            sub="lifetime · gross"
          />
          <KpiTile
            label="Realized P&L"
            tone={k.realizedPnlEgp >= 0 ? 'pos' : 'neg'}
            value={fmtEgp(k.realizedPnlEgp, { compact: true })}
            sub="FIFO matched"
          />
          <KpiTile
            label="Unrealized P&L"
            tone={k.unrealizedPnlEgp >= 0 ? 'pos' : 'neg'}
            value={fmtEgp(k.unrealizedPnlEgp, { compact: true })}
            sub="vs last manual prices"
          />
          <KpiTile
            label="Margin Interest + Fees"
            tone="neg"
            value={fmtEgp(cap.totalInterestPaidEgp + cap.totalFeesPaidEgp, { compact: true })}
            sub={`int ${fmtEgp(cap.totalInterestPaidEgp, { compact: true })} · fees ${fmtEgp(cap.totalFeesPaidEgp, { compact: true })}`}
          />
        </div>
      </section>

      <section>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
          Lifetime activity{' '}
          <span className="text-slate-400 normal-case tracking-normal">
            gross flows · not current balance
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <div className="ix-card p-2">
            <div className="text-[9px] uppercase text-slate-500">Bank deposits</div>
            <div className="text-base font-semibold text-emerald-700">
              {fmtEgp(k.cashInEgp, { compact: true })}
            </div>
          </div>
          <div className="ix-card p-2">
            <div className="text-[9px] uppercase text-slate-500">Bank withdrawals</div>
            <div className="text-base font-semibold text-rose-700">
              {fmtEgp(k.cashOutEgp, { compact: true })}
            </div>
          </div>
          <div className="ix-card p-2">
            <div className="text-[9px] uppercase text-slate-500">Total bought</div>
            <div className="text-base font-semibold">
              {fmtEgp(k.totalBoughtEgp, { compact: true })}
            </div>
          </div>
          <div className="ix-card p-2">
            <div className="text-[9px] uppercase text-slate-500">Total sold</div>
            <div className="text-base font-semibold">
              {fmtEgp(k.totalSoldEgp, { compact: true })}
            </div>
          </div>
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
        <RealizedPnlChart data={realizedByYear} />
      </div>
    </div>
  );
}
