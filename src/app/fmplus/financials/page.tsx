import Link from 'next/link';
import { ChevronRight, BarChart3, Briefcase, Landmark, LineChart, FolderTree } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '@/app/fmplus/_components/fmplus-hero';
import { resolvePeriodSeries } from '@/lib/fmplus/period-series';
import { buildFmplusPnl, buildFmplusBalanceSheet } from '@/lib/fmplus/financials';
import { buildFmplusDashboard } from '@/lib/fmplus/dashboard';
import { buildFmplusPayables } from '@/lib/fmplus/payables';
import { discoverFmplusCompanyId } from '@/lib/fmplus/discover-company';
import {
  listFmplusPlansWithActivity,
  listFmplusProjectsWithActivity,
} from '@/lib/fmplus/analytic-picker';
import { buildFmplusProjectRankings } from '@/lib/fmplus/project-rankings';
import { FilterBar } from './_components/FilterBar';
import { PnlTable } from './_components/PnlTable';
import { BalanceSheetTable } from './_components/BalanceSheetTable';
import { Dashboard } from './_components/Dashboard';
import { PayablesGrid } from './_components/PayablesGrid';
import { AnalyticPicker } from './_components/AnalyticPicker';
import { ProjectsView } from './_components/ProjectsView';
import { ComparePnlTable, type ComparePnlEntry } from './_components/ComparePnlTable';
import type { Granularity, ScopeMode, Scope } from '@/lib/fmplus/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type View = 'dashboard' | 'pnl' | 'balance_sheet' | 'projects';

type Search = {
  view?: View;
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
  const view: View =
    sp.view === 'pnl' || sp.view === 'balance_sheet' || sp.view === 'projects' ? sp.view : 'dashboard';
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
        {/* Hero header — shared FmplusHero (FM+ logo on the right) */}
        <FmplusHero
          eyebrow="FMPLUS · FINANCIALS"
          title="Financials Dashboard"
          subtitle="FMPLUS Property & Facility Management — Dashboard, P&L, and Balance Sheet pulled live from Odoo."
          icon={LineChart}
        />

        {/* Tab nav */}
        <nav className="border-b border-slate-200 dark:border-slate-700 flex gap-1 -mt-2">
          {(
            [
              { id: 'dashboard',     label: 'Dashboard',     Icon: BarChart3 },
              { id: 'pnl',           label: 'Profit & Loss', Icon: Briefcase },
              { id: 'balance_sheet', label: 'Balance Sheet', Icon: Landmark },
              { id: 'projects',      label: 'Projects',      Icon: FolderTree },
            ] as const
          ).map(t => {
            const active = view === t.id;
            return (
              <Link
                key={t.id}
                href={buildHref({ view: t.id })}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 ${
                  active
                    ? 'border-fmplus-yellow text-fmplus-gold dark:text-fmplus-yellow'
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
          preservedParams={{
            plan: selectedPlanSlug || undefined,
            account: !multi && selectedProjectIds[0] ? String(selectedProjectIds[0]) : undefined,
            accounts: multi && selectedProjectIds.length > 0 ? selectedProjectIds.join(',') : undefined,
            multi: multi ? '1' : undefined,
          }}
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
          multi && selectedProjectIds.length >= 2 ? (
            // Side-by-side compare: build one P&L per project (single-period)
            // and merge at render time. Cap at 5 enforced upstream by the
            // picker. Force periods=1 here so each column = one project's
            // P&L for the asof period.
            <ComparePnlTable
              entries={await buildCompareEntries({
                projectIds: selectedProjectIds,
                projectNameById: new Map(projects.map(p => [p.id, p.name])),
                periods: [periodSeries[0]],
                baseScope: scope,
              })}
            />
          ) : (
            <PnlTable
              report={await buildFmplusPnl({ periods: periodSeries, scope })}
              exportProps={{ ...exportPropsBase, view: 'pnl' }}
            />
          )
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

        {view === 'projects' && (
          <ProjectsView
            rankings={await buildFmplusProjectRankings({
              companyId: fmplusCompanyId,
              fromDate: pickerFromDate,
              toDate: pickerToDate,
              planSlug: selectedPlanSlug ?? undefined,
              includeDrafts,
            })}
            buildHref={buildHref}
            selectedPlanSlug={selectedPlanSlug}
          />
        )}
      </main>
    </>
  );
}

// Build one P&L per selected project for side-by-side rendering.
async function buildCompareEntries(args: {
  projectIds: number[];
  projectNameById: Map<number, string>;
  periods: import('@/lib/fmplus/types').Period[];
  baseScope: Scope;
}): Promise<ComparePnlEntry[]> {
  const out: ComparePnlEntry[] = [];
  for (const id of args.projectIds) {
    const report = await buildFmplusPnl({
      periods: args.periods,
      scope: { ...args.baseScope, accountIds: [id], planId: undefined },
    });
    out.push({
      account_id: id,
      account_name: args.projectNameById.get(id) || `Project ${id}`,
      report,
    });
  }
  return out;
}
