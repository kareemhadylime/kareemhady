import Link from 'next/link';
import { ChevronRight, BarChart3, Briefcase, Landmark } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { buildFmplusDashboard } from '@/lib/fmplus/dashboard';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import { FilterBar } from './_components/FilterBar';
import { PnlTable } from './_components/PnlTable';
import { BalanceSheetTable } from './_components/BalanceSheetTable';
import { Dashboard } from './_components/Dashboard';
import type { Granularity, ScopeMode, Scope } from '@/lib/fmplus/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Search = {
  view?: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity?: Granularity;
  periods?: string;
  asof?: string;
  mode?: ScopeMode;
  plans?: string;
  plan?: string;
  accounts?: string;
  with_dep?: string;
  include_drafts?: string;
};

function parseInt0(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

function defaultAsof(g: Granularity): string {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = now.getUTCMonth() + 1;
  if (g === 'monthly')   return `${yy}-${String(mm).padStart(2, '0')}`;
  if (g === 'quarterly') return `${yy}-Q${Math.floor((mm - 1) / 3) + 1}`;
  return String(yy);
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const view: 'dashboard' | 'pnl' | 'balance_sheet' =
    sp.view === 'pnl' || sp.view === 'balance_sheet' ? sp.view : 'dashboard';
  const granularity: Granularity =
    sp.granularity === 'quarterly' || sp.granularity === 'yearly' ? sp.granularity : 'monthly';
  const periods = parseInt0(sp.periods, 3);
  const asof = sp.asof || defaultAsof(granularity);
  const mode: ScopeMode =
    sp.mode === 'plans' || sp.mode === 'accounts' ? sp.mode : 'trend';
  const withDep = sp.with_dep !== '0';
  const includeDrafts = sp.include_drafts !== '0';

  const fmplusCompanyId = await discoverFmplusCompanyId();
  const periodSeries = resolvePeriodSeries(granularity, periods, asof);

  const planIds = sp.plans
    ? sp.plans.split(',').map(Number).filter(Number.isFinite)
    : undefined;
  const planId = sp.plan ? Number(sp.plan) : undefined;
  const accountIds = sp.accounts
    ? sp.accounts.split(',').map(Number).filter(Number.isFinite)
    : undefined;

  const scope: Scope = {
    mode,
    companyIds: [fmplusCompanyId],
    planIds: mode === 'plans' ? planIds : undefined,
    planId: mode === 'accounts' ? planId : undefined,
    accountIds: mode === 'accounts' ? accountIds : undefined,
    includeDrafts,
    withDep,
  };

  const exportPropsBase = {
    granularity,
    periods,
    asof,
    mode,
    withDep,
    includeDrafts,
    plans: planIds?.join(',') || undefined,
    plan: planId ? String(planId) : undefined,
    accounts: accountIds?.join(',') || undefined,
  };

  const buildHref = (overrides: Partial<Record<string, string | undefined>> = {}) => {
    const merged: Record<string, string> = {
      view, granularity, periods: String(periods), asof, mode,
      ...(planIds ? { plans: planIds.join(',') } : {}),
      ...(planId ? { plan: String(planId) } : {}),
      ...(accountIds ? { accounts: accountIds.join(',') } : {}),
      with_dep: withDep ? '1' : '0',
      include_drafts: includeDrafts ? '1' : '0',
    };
    for (const [k, v] of Object.entries(overrides)) {
      if (v == null || v === '') delete merged[k];
      else merged[k] = String(v);
    }
    const qs = Object.entries(merged)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return qs ? `?${qs}` : '';
  };

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium">FMPLUS · Financials</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Financials Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">FMPLUS Property &amp; Facility Management — pulled live from Odoo.</p>
        </header>

        {/* Tab nav */}
        <nav className="border-b border-slate-200 flex gap-1">
          {(
            [
              { id: 'dashboard',     label: 'Dashboard',     Icon: BarChart3 },
              { id: 'pnl',           label: 'Profit & Loss', Icon: Briefcase },
              { id: 'balance_sheet', label: 'Balance Sheet', Icon: Landmark },
            ] as const
          ).map(t => {
            const active = view === t.id;
            return (
              <Link
                key={t.id}
                href={buildHref({ view: t.id })}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 ${
                  active
                    ? 'border-amber-500 text-amber-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <t.Icon size={14} />
                {t.label}
              </Link>
            );
          })}
        </nav>

        <FilterBar
          view={view}
          granularity={granularity}
          periods={periods}
          asof={asof}
          mode={mode}
          planIds={planIds}
          planId={planId}
          accountIds={accountIds}
          withDep={withDep}
          includeDrafts={includeDrafts}
          buildHref={buildHref}
        />

        {view === 'dashboard' && (
          <Dashboard data={await buildFmplusDashboard({ granularity, asof, scope })} />
        )}
        {view === 'pnl' && (
          <PnlTable
            report={await buildFmplusPnl({ periods: periodSeries, scope })}
            exportProps={{ ...exportPropsBase, view: 'pnl' }}
          />
        )}
        {view === 'balance_sheet' && (
          <BalanceSheetTable
            report={await buildFmplusBalanceSheet({ periods: periodSeries, scope })}
            exportProps={{ ...exportPropsBase, view: 'balance_sheet' }}
          />
        )}
      </main>
    </>
  );
}
