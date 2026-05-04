import Link from 'next/link';
import { ChevronRight, BarChart3, Briefcase, Landmark, LineChart } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { buildFmplusDashboard } from '@/lib/fmplus/dashboard';
import { buildFmplusPayables } from '@/lib/fmplus/payables';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import {
  listFmplusPlansWithActivity,
  listFmplusProjectsWithActivity,
} from '@/lib/fmplus/analytic-picker';
import { FilterBar } from './_components/FilterBar';
import { PnlTable } from './_components/PnlTable';
import { BalanceSheetTable } from './_components/BalanceSheetTable';
import { Dashboard } from './_components/Dashboard';
import { PayablesGrid } from './_components/PayablesGrid';
import { AnalyticPicker } from './_components/AnalyticPicker';
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
  plan?: string;        // service line slug ('hk' | 'mep' | 'mix' | 'security')
  account?: string;     // single selected project (analytic_account.id)
  accounts?: string;    // multi-select project ids (csv)
  multi?: string;       // '1' = multi-select on, '0' = single-select
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

  // Selected service-line slug (Tier 1) and project id(s) (Tier 2).
  const selectedPlanSlug = sp.plan && sp.plan.length > 0 ? sp.plan : null;
  const multi = sp.multi === '1';
  const selectedProjectIds: number[] = multi
    ? (sp.accounts ? sp.accounts.split(',').map(Number).filter(Number.isFinite) : [])
    : (sp.account ? [Number(sp.account)].filter(Number.isFinite) : []);

  // Picker data — fetch plans (always) + projects (only if a plan is picked).
  // Activity window = the FULL period series (earliest fromDate → latest toDate)
  // so a project active in any of the visible periods stays in the list.
  const pickerFromDate = periodSeries[periodSeries.length - 1].fromDate;
  const pickerToDate   = periodSeries[0].toDate;
  const plans = await listFmplusPlansWithActivity({
    companyId: fmplusCompanyId,
    fromDate: pickerFromDate,
    toDate: pickerToDate,
  });
  const projects = selectedPlanSlug
    ? await listFmplusProjectsWithActivity({
        companyId: fmplusCompanyId,
        fromDate: pickerFromDate,
        toDate: pickerToDate,
        planSlug: selectedPlanSlug,
      })
    : [];

  // Resolve slug → numeric plan_id for the RPC scope.
  const selectedPlanId = selectedPlanSlug
    ? plans.find(p => p.slug === selectedPlanSlug)?.id
    : undefined;

  const scope: Scope = {
    mode,
    companyIds: [fmplusCompanyId],
    // Plan filter: when a service line is picked AND no individual projects
    // are selected, scope to the plan. When projects are selected, the
    // account_ids filter is more specific so plan_id becomes redundant.
    planId: selectedPlanId && selectedProjectIds.length === 0 ? selectedPlanId : undefined,
    accountIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    planIds: undefined,  // legacy 'plans' mode unused in current UI
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
    plan: selectedPlanSlug || undefined,
    account: !multi && selectedProjectIds[0] ? String(selectedProjectIds[0]) : undefined,
    accounts: multi && selectedProjectIds.length > 0 ? selectedProjectIds.join(',') : undefined,
  };

  const buildHref = (overrides: Partial<Record<string, string | undefined>> = {}) => {
    const merged: Record<string, string> = {
      view, granularity, periods: String(periods), asof, mode,
      ...(selectedPlanSlug ? { plan: selectedPlanSlug } : {}),
      ...(!multi && selectedProjectIds.length === 1 ? { account: String(selectedProjectIds[0]) } : {}),
      ...(multi && selectedProjectIds.length > 0 ? { accounts: selectedProjectIds.join(',') } : {}),
      ...(multi ? { multi: '1' } : {}),
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
        {/* Hero header — matches Beithady launcher card visual language */}
        <header className="relative ix-card p-6 overflow-hidden">
          <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 opacity-[0.08] blur-3xl pointer-events-none" />
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl inline-flex items-center justify-center bg-amber-50 dark:bg-amber-950 shrink-0">
              <LineChart size={28} strokeWidth={2.2} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold">FMPLUS · Financials</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">Financials Dashboard</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                FMPLUS Property &amp; Facility Management — Dashboard, P&amp;L, and Balance Sheet pulled live from Odoo.
              </p>
            </div>
          </div>
        </header>

        {/* Tab nav */}
        <nav className="border-b border-slate-200 dark:border-slate-700 flex gap-1 -mt-2">
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
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 ${
                  active
                    ? 'border-amber-500 text-amber-700 dark:text-amber-300'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <t.Icon size={14} />
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Analytic Account picker (above filters). Skipped on Balance Sheet
            since BS is whole-company and analytic_account_id doesn't apply
            to asset/liability/equity move-lines. */}
        {view !== 'balance_sheet' && (
          <AnalyticPicker
            plans={plans}
            projects={projects}
            selectedPlanSlug={selectedPlanSlug}
            selectedProjectIds={selectedProjectIds}
            multi={multi}
            buildHref={buildHref}
          />
        )}

        <FilterBar
          view={view}
          granularity={granularity}
          periods={periods}
          asof={asof}
          mode={mode}
          withDep={withDep}
          includeDrafts={includeDrafts}
          buildHref={buildHref}
        />

        {view === 'dashboard' && (
          <>
            <Dashboard data={await buildFmplusDashboard({ granularity, asof, scope })} />
            <PayablesGrid
              report={await buildFmplusPayables({
                asOf: periodSeries[0].toDate,
                companyId: fmplusCompanyId,
              })}
            />
          </>
        )}
        {view === 'pnl' && (
          <PnlTable
            report={await buildFmplusPnl({ periods: periodSeries, scope })}
            exportProps={{ ...exportPropsBase, view: 'pnl' }}
          />
        )}
        {view === 'balance_sheet' && (
          <>
            <BalanceSheetTable
              report={await buildFmplusBalanceSheet({ periods: periodSeries, scope })}
              exportProps={{ ...exportPropsBase, view: 'balance_sheet' }}
            />
            <PayablesGrid
              report={await buildFmplusPayables({
                asOf: periodSeries[0].toDate,
                companyId: fmplusCompanyId,
              })}
            />
          </>
        )}
      </main>
    </>
  );
}
