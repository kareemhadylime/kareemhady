import Link from 'next/link';
import {
  ChevronRight,
  Calendar,
  TrendingUp,
  TrendingDown,
  Users,
  Wrench,
  Home as HomeIcon,
  AlertTriangle,
  RefreshCcw,
  Building2,
  Briefcase,
  Landmark,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import {
  buildPnlReport,
  buildPayablesReport,
  buildBalanceSheet,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  listAvailableBuildings,
  listAvailableLobs,
  COMPANY_LABELS,
  type PnlReport,
  type PayablesReport,
  type PayablePartnerRow,
  type BalanceSheetReport,
  type BalanceSheetGroup,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SyncPills } from '@/app/_components/sync-pills';
import { getSyncFreshness } from '@/lib/sync-freshness';
import {
  PeriodPresetLink,
  PeriodSubmitForm,
  PeriodSubmitButton,
} from './_components/PeriodControls';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FINANCE_PRESETS: Array<{ id: string; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
];

const COMPANY_TABS: Array<{ id: CompanyScope; label: string; short: string }> = [
  { id: 'consolidated', label: 'Beithady Consolidated', short: 'Consolidated' },
  { id: 'egypt', label: 'Beithady Egypt', short: 'Egypt' },
  { id: 'dubai', label: 'Beithady FZCO Dubai', short: 'Dubai' },
  { id: 'a1', label: 'A1HOSPITALITY', short: 'A1' },
];

// Sub-tabs that let the operator drill by analytic account in one click.
// Building tabs set `?building=BH-XX`; LOB tabs set `?lob=<lob_label>`.
// The two dimensions are mutually exclusive in the URL — picking a building
// clears `lob`, picking a LOB clears `building`, and "All" clears both.
// LOB labels map to Odoo's plan-derived `lob_label` column ('Arbitrage'
// and 'Management') — display names are the business-facing aliases.
const ANALYTIC_TABS: Array<{
  id: string;
  label: string;
  building?: string;
  lob?: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'bh26', label: 'BH-26', building: 'BH-26' },
  { id: 'bh73', label: 'BH-73', building: 'BH-73' },
  { id: 'bh435', label: 'BH-435', building: 'BH-435' },
  { id: 'bhok', label: 'BH-OK · One Kattameya', building: 'BH-OK' },
  { id: 'leased', label: 'Leased Properties', lob: 'Arbitrage' },
  { id: 'management', label: 'Management Properties', lob: 'Management' },
];

const fmt = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('en-US');
};
const fmtSigned = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  return Math.round(v).toLocaleString('en-US');
};
const pct = (num: number, denom: number): string =>
  !denom || denom === 0 ? '—' : `${((num / denom) * 100).toFixed(1)}%`;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
    scope?: string;
    building?: string;
    lob?: string;
    view?: 'pnl' | 'balance_sheet';
  }>;
}) {
  const sp = await searchParams;
  const preset = sp.month ? `month:${sp.month}` : sp.preset || 'last_month';
  const period = resolveFinancePeriod(preset, sp.from, sp.to);
  const scope: CompanyScope = isCompanyScope(sp.scope) ? sp.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const buildingCode = sp.building && sp.building !== 'all' ? sp.building : undefined;
  const lobLabel = sp.lob && sp.lob !== 'all' ? sp.lob : undefined;

  const [pnl, payables, balanceSheet, latestSync, buildings, lobs, pills] = await Promise.all([
    buildPnlReport({
      fromDate: period.fromDate,
      toDate: period.toDate,
      label: period.label,
      companyIds,
      buildingCode,
      lobLabel,
    }),
    buildPayablesReport({ asOf: period.toDate, companyIds }),
    buildBalanceSheet({ asOf: period.toDate, companyIds }),
    getLatestSync(),
    listAvailableBuildings(),
    listAvailableLobs(),
    getSyncFreshness(['odoo', 'guesty', 'pricelabs']),
  ]);

  const keepParams = {
    preset,
    from: sp.from,
    to: sp.to,
    month: sp.month,
    building: buildingCode,
    lob: lobLabel,
  };
  const buildHref = (
    overrides: Partial<
      typeof keepParams & { scope: CompanyScope }
    > = {}
  ) => {
    const merged = { ...keepParams, scope, ...overrides };
    const qs = Object.entries(merged)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `?${qs}` : '';
  };

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">
          Emails
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              BEITHADY · Financials
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              {scopeLabel(scope)}
            </h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <Landmark size={13} />
              {scope === 'consolidated' &&
                'Intercompany eliminated between Egypt and Dubai.'}
              {scope === 'egypt' && 'Standalone — includes intercompany lines.'}
              {scope === 'dubai' && 'Standalone — includes intercompany lines.'}
              {scope === 'a1' && 'Owner-side P&L for BH-435 (Lime 50% stake).'}
            </p>
            <div className="mt-2"><SyncPills pills={pills} /></div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-1">
            {latestSync ? (
              <>
                <p className="flex items-center gap-1.5 justify-end">
                  <RefreshCcw size={12} />
                  Synced {fmtCairoDateTime(latestSync.finished_at)}
                </p>
                <p className="text-[11px]">
                  {latestSync.move_lines_synced?.toLocaleString() || 0} lines ·{' '}
                  {latestSync.accounts_synced?.toLocaleString() || 0} accounts ·{' '}
                  {latestSync.partners_synced?.toLocaleString() || 0} partners
                </p>
              </>
            ) : (
              <p>No sync yet.</p>
            )}
          </div>
        </header>

        <CompanyTabs activeScope={scope} buildHref={buildHref} />

        <AnalyticTabs
          activeBuilding={buildingCode}
          activeLob={lobLabel}
          buildHref={buildHref}
        />

        <PeriodFilter
          activeId={period.id}
          fromDefault={period.fromDate}
          toDefault={period.toDate}
          scope={scope}
          buildingCode={buildingCode}
          lobLabel={lobLabel}
        />

        <AnalyticFilter
          buildings={buildings}
          lobs={lobs}
          activeBuilding={buildingCode}
          activeLob={lobLabel}
          scope={scope}
          preset={preset}
        />

        <PnlSection
          pnl={pnl}
          scopeLbl={scopeLabel(scope)}
          buildingCode={buildingCode}
          lobLabel={lobLabel}
        />

        <BalanceSheetSection bs={balanceSheet} />

        <PayablesBlock payables={payables} />

        {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          {pnl.line_count.toLocaleString()} P&amp;L lines · balance sheet from
          posted entries. Companies in scope: {companyIds.map(id => COMPANY_LABELS[id] || id).join(', ')}.
          Amounts in company currency (EGP), converted at Odoo's weekly FX rate.
        </footer>
      </main>
    </>
  );
}

function CompanyTabs({
  activeScope,
  buildHref,
}: {
  activeScope: CompanyScope;
  buildHref: (o: Partial<{ scope: CompanyScope }>) => string;
}) {
  return (
    <section className="ix-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Building2 size={16} className="text-rose-600" />
        <h2 className="text-sm font-semibold">Scope</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {COMPANY_TABS.map(t => {
          const active = activeScope === t.id;
          return (
            <Link
              key={t.id}
              href={buildHref({ scope: t.id })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-rose-600 text-white shadow-sm hover:bg-rose-700'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function AnalyticTabs({
  activeBuilding,
  activeLob,
  buildHref,
}: {
  activeBuilding?: string;
  activeLob?: string;
  buildHref: (
    overrides?: Partial<{
      scope: CompanyScope;
      building: string | undefined;
      lob: string | undefined;
    }>
  ) => string;
}) {
  const activeId = activeBuilding
    ? `building:${activeBuilding}`
    : activeLob
      ? `lob:${activeLob}`
      : 'all';
  return (
    <section className="ix-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase size={16} className="text-emerald-600" />
        <h2 className="text-sm font-semibold">Analytic Account</h2>
        <span className="text-[11px] text-slate-500">
          quick-select a building or line of business
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {ANALYTIC_TABS.map(t => {
          const id = t.building
            ? `building:${t.building}`
            : t.lob
              ? `lob:${t.lob}`
              : 'all';
          const active = activeId === id;
          return (
            <Link
              key={t.id}
              href={buildHref({
                building: t.building,
                lob: t.lob,
              })}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active
                  ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function AnalyticFilter({
  buildings,
  lobs,
  activeBuilding,
  activeLob,
  scope,
  preset,
}: {
  buildings: Array<{ code: string; account_count: number; sample_name: string }>;
  lobs: Array<{ label: string; account_count: number }>;
  activeBuilding: string | undefined;
  activeLob: string | undefined;
  scope: CompanyScope;
  preset: string;
}) {
  if (buildings.length === 0 && lobs.length === 0) return null;
  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Briefcase size={16} className="text-emerald-600" />
        <h2 className="text-sm font-semibold">Segregation</h2>
        <span className="text-[11px] text-slate-500">
          filter the P&amp;L by building or line of business (via Odoo analytic accounts)
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-3" action="" method="get">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="preset" value={preset} />
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">Building</span>
          <select
            name="building"
            defaultValue={activeBuilding || 'all'}
            className="ix-input w-[180px]"
          >
            <option value="all">All buildings</option>
            {buildings.map(b => (
              <option key={b.code} value={b.code}>
                {b.code} ({b.account_count} acct)
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700">Line of Business</span>
          <select
            name="lob"
            defaultValue={activeLob || 'all'}
            className="ix-input w-[180px]"
          >
            <option value="all">All LOBs</option>
            {lobs.map(l => (
              <option key={l.label} value={l.label}>
                {l.label} ({l.account_count})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Apply
        </button>
        {(activeBuilding || activeLob) && (
          <Link
            href={`?scope=${scope}&preset=${preset}`}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Clear
          </Link>
        )}
      </form>
      {(activeBuilding || activeLob) && (
        <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-1.5 rounded">
          Filtering active — only P&amp;L lines tagged with{' '}
          {activeBuilding ? <strong>Building {activeBuilding}</strong> : ''}
          {activeBuilding && activeLob ? ' AND ' : ''}
          {activeLob ? <strong>LOB {activeLob}</strong> : ''} in Odoo's analytic
          distribution are included. Balance Sheet + Payables are NOT filtered.
        </p>
      )}
    </section>
  );
}

function PeriodFilter({
  activeId,
  fromDefault,
  toDefault,
  scope,
  buildingCode,
  lobLabel,
}: {
  activeId: string;
  fromDefault: string;
  toDefault: string;
  scope: CompanyScope;
  buildingCode?: string;
  lobLabel?: string;
}) {
  const now = new Date();
  const months: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    months.push({ value, label });
  }
  return (
    <section className="ix-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-indigo-600" />
        <h2 className="text-sm font-semibold">Period</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {FINANCE_PRESETS.map(p => {
          const qs = [
            `preset=${p.id}`,
            `scope=${scope}`,
            buildingCode ? `building=${encodeURIComponent(buildingCode)}` : '',
            lobLabel ? `lob=${encodeURIComponent(lobLabel)}` : '',
          ]
            .filter(Boolean)
            .join('&');
          return (
            <PeriodPresetLink
              key={p.id}
              href={`?${qs}`}
              label={p.label}
              active={activeId === p.id}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <PeriodSubmitForm className="flex gap-2 items-end">
          <input type="hidden" name="scope" value={scope} />
          {buildingCode && <input type="hidden" name="building" value={buildingCode} />}
          {lobLabel && <input type="hidden" name="lob" value={lobLabel} />}
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700">Specific month</span>
            <select
              name="month"
              defaultValue={activeId.startsWith('month-') ? activeId.replace('month-', '') : ''}
              className="ix-input w-[180px]"
            >
              <option value="">Pick a month…</option>
              {months.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <PeriodSubmitButton label="Go" />
        </PeriodSubmitForm>

        <PeriodSubmitForm className="flex items-end gap-2">
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="preset" value="custom" />
          {buildingCode && <input type="hidden" name="building" value={buildingCode} />}
          {lobLabel && <input type="hidden" name="lob" value={lobLabel} />}
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700">From</span>
            <input
              type="date"
              name="from"
              defaultValue={fromDefault}
              className="ix-input w-[160px]"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-700">To</span>
            <input
              type="date"
              name="to"
              defaultValue={toDefault}
              className="ix-input w-[160px]"
            />
          </label>
          <PeriodSubmitButton label="Apply" />
        </PeriodSubmitForm>
      </div>
    </section>
  );
}

// P&L renderer — same expand/collapse philosophy as the Balance Sheet.
// Main line items (section totals + subtotals like Sub Gross Profit / Gross
// Profit / EBITDA / Net Profit) are ALWAYS visible. Section rows are
// <details> that start CLOSED — click to drill in to subgroups + leaves.
// Subtotal rows between sections stay flat so the operator reads the
// income-statement cascade at a glance.
function PnlSection({
  pnl,
  scopeLbl,
  buildingCode,
  lobLabel,
}: {
  pnl: PnlReport & { intercompany_excluded_lines?: number };
  scopeLbl: string;
  buildingCode?: string;
  lobLabel?: string;
}) {
  const t = pnl.totals;
  const rev = t.revenue || 1;
  const toPctOfRev = (x: number) => pct(x, rev);

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase size={18} className="text-rose-600" />
            Profit &amp; Loss · {pnl.period.label}
          </h2>
          <p className="text-xs text-slate-500">
            {scopeLbl} · Draft + posted entries · amounts in EGP.
            {pnl.intercompany_excluded_lines
              ? ` Intercompany excluded (${pnl.intercompany_excluded_lines} lines).`
              : ''}
            {buildingCode ? ` · Building: ${buildingCode}` : ''}
            {lobLabel ? ` · LOB: ${lobLabel}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Net Profit (EGP)</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              t.net_profit < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {fmtSigned(t.net_profit)}
          </p>
        </div>
      </div>

      {/* Column key row — lines up with the collapsible section headers below */}
      <div className="px-5 py-2 bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide flex items-center gap-3">
        <span className="flex-1">Account</span>
        <span className="w-32 text-right">Balance (EGP)</span>
        <span className="w-20 text-right">% Rev</span>
      </div>

      <div className="divide-y divide-slate-100">
        <PnlSectionBand
          section={pnl.sections.revenue}
          emphasis="revenue"
          totalPct={toPctOfRev}
        />
        <PnlSectionBand
          section={pnl.sections.cost_of_revenue}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="Sub Gross Profit"
          value={t.sub_gross_profit}
          pct={toPctOfRev(t.sub_gross_profit)}
          tone="neutral"
        />
        <PnlSectionBand
          section={pnl.sections.home_owner_cut}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="Gross Profit"
          value={t.gross_profit}
          pct={toPctOfRev(t.gross_profit)}
          tone={t.gross_profit < 0 ? 'negative' : 'positive'}
        />
        <PnlSectionBand
          section={pnl.sections.general_expenses}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <PnlSubtotalRow
          label="EBITDA"
          value={t.ebitda}
          pct={toPctOfRev(t.ebitda)}
          tone={t.ebitda < 0 ? 'negative' : 'positive'}
        />
        <PnlSectionBand
          section={pnl.sections.interest_tax_dep}
          emphasis="expense"
          totalPct={toPctOfRev}
        />
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center gap-3 font-bold text-base">
          <span className="flex-1">Net Profit</span>
          <span className="w-32 text-right tabular-nums">{fmtSigned(t.net_profit)}</span>
          <span className="w-20 text-right tabular-nums">{toPctOfRev(t.net_profit)}</span>
        </div>
      </div>
    </section>
  );
}

function PnlSectionBand({
  section,
  emphasis,
  totalPct,
}: {
  section: PnlReport['sections'][keyof PnlReport['sections']];
  emphasis: 'revenue' | 'expense';
  totalPct: (n: number) => string;
}) {
  const hasContent = section.subgroups.some(
    sg => sg.accounts.length > 0 || sg.total !== 0
  );
  const headerTone =
    emphasis === 'revenue'
      ? 'text-emerald-700 bg-emerald-50/60'
      : 'text-slate-800 bg-slate-50';
  return (
    <details className="group/pnl">
      <summary
        className={`list-none ${
          hasContent ? 'cursor-pointer' : 'cursor-default'
        } select-none px-5 py-2 flex items-center gap-3 font-semibold ${headerTone} hover:brightness-[0.98] transition`}
      >
        <span className="flex-1 flex items-center gap-2">
          {hasContent && (
            <svg
              className="w-3.5 h-3.5 transition-transform group-open/pnl:rotate-90 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span>{section.label}</span>
        </span>
        <span className="w-32 text-right tabular-nums">{fmtSigned(section.total)}</span>
        <span className="w-20 text-right tabular-nums">{totalPct(section.total)}</span>
      </summary>
      {hasContent && (
        <div className="bg-white">
          {section.subgroups.map(sg => (
            <PnlSubgroupBand key={sg.key} sg={sg} totalPct={totalPct} />
          ))}
        </div>
      )}
    </details>
  );
}

function PnlSubgroupBand({
  sg,
  totalPct,
}: {
  sg: PnlReport['sections'][keyof PnlReport['sections']]['subgroups'][number];
  totalPct: (n: number) => string;
}) {
  if (sg.total === 0 && sg.accounts.length === 0) return null;
  const hasLeaves = sg.accounts.length > 0;
  return (
    <details className="group/sub border-t border-slate-100">
      <summary
        className={`list-none ${
          hasLeaves ? 'cursor-pointer' : 'cursor-default'
        } select-none pl-10 pr-5 py-1.5 flex items-center gap-3 bg-slate-50/40 text-slate-700 font-medium text-sm hover:bg-slate-50 transition`}
      >
        <span className="flex-1 flex items-center gap-2">
          {hasLeaves && (
            <svg
              className="w-3 h-3 transition-transform group-open/sub:rotate-90 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span>{sg.label}</span>
        </span>
        <span className="w-32 text-right tabular-nums">{fmtSigned(sg.total)}</span>
        <span className="w-20 text-right tabular-nums text-slate-500">
          {totalPct(sg.total)}
        </span>
      </summary>
      {hasLeaves && (
        <table className="w-full text-[12px]">
          <tbody>
            {sg.accounts.map((a, i) => (
              <tr
                key={`${a.code}:${i}`}
                className="text-slate-600 border-t border-slate-50"
              >
                <td className="pl-[4.5rem] pr-3 py-1 font-mono text-[10px] text-slate-400 w-16">
                  {a.code || '—'}
                </td>
                <td className="pr-3 py-1 truncate max-w-[380px]" title={a.name}>
                  {a.name}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums w-32">
                  {fmtSigned(a.balance)}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums text-slate-400 text-[11px] w-20">
                  {totalPct(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function PnlSubtotalRow({
  label,
  value,
  pct: pctStr,
  tone,
}: {
  label: string;
  value: number;
  pct: string;
  tone: 'neutral' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'negative'
      ? 'text-rose-600'
      : tone === 'positive'
        ? 'text-emerald-600'
        : 'text-slate-800';
  const Icon =
    tone === 'negative' ? TrendingDown : tone === 'positive' ? TrendingUp : null;
  return (
    <div className="bg-slate-100 px-5 py-2.5 flex items-center gap-3 font-bold border-t-2 border-slate-200">
      <span className="flex-1 inline-flex items-center gap-2">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span className={`w-32 text-right tabular-nums ${toneClass}`}>
        {fmtSigned(value)}
      </span>
      <span className={`w-20 text-right tabular-nums ${toneClass}`}>{pctStr}</span>
    </div>
  );
}

// Balance Sheet renderer — mirrors the Feb-2026 xlsx template:
//   ASSETS / LIABILITIES / EQUITY / LIABILITIES + EQUITY
// Each section is a <details> that starts OPEN; each group inside it is a
// <details> that starts CLOSED so the operator sees the high-level line
// items first and only expands the groups they want to drill into. All
// native — no client-side React, no JS hydration needed.
function BalanceSheetSection({ bs }: { bs: BalanceSheetReport }) {
  const delta = bs.assets.total - bs.liabilities_plus_equity;
  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Landmark size={18} className="text-indigo-600" />
            Balance Sheet · as of {bs.as_of}
          </h2>
          <p className="text-xs text-slate-500">
            Posted entries only · all amounts in EGP ·{' '}
            {bs.balanced ? (
              <span className="text-emerald-600 font-medium">✓ Balanced</span>
            ) : (
              <span className="text-amber-600 font-medium">
                ⚠ Unbalanced by {fmt(Math.abs(delta))}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <StatBlock label="Assets" value={bs.assets.total} tone="indigo" />
          <StatBlock
            label="Liab + Equity"
            value={bs.liabilities_plus_equity}
            tone="slate"
          />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <BalanceTopSection
          label="ASSETS"
          total={bs.assets.total}
          tone="indigo"
          groups={bs.assets.groups}
        />
        <BalanceTopSection
          label="LIABILITIES"
          total={bs.liabilities.total}
          tone="rose"
          groups={bs.liabilities.groups}
        />
        <BalanceTopSection
          label="EQUITY"
          total={bs.equity.total}
          tone="amber"
          groups={bs.equity.groups}
        />
        <div className="px-5 py-3 flex items-center justify-between text-sm font-bold text-slate-800 bg-slate-50">
          <span>LIABILITIES + EQUITY</span>
          <span className="tabular-nums">{fmt(bs.liabilities_plus_equity)}</span>
        </div>
      </div>
    </section>
  );
}

function BalanceTopSection({
  label,
  total,
  tone,
  groups,
}: {
  label: string;
  total: number;
  tone: 'indigo' | 'rose' | 'amber';
  groups: BalanceSheetGroup[];
}) {
  const toneClass =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : 'text-amber-700';
  return (
    <details open className="group">
      <summary
        className={`list-none cursor-pointer select-none px-5 py-3 flex items-center justify-between text-sm font-bold uppercase tracking-wide ${toneClass} hover:bg-slate-50 transition`}
      >
        <span className="inline-flex items-center gap-2">
          <svg
            className="w-3.5 h-3.5 transition-transform group-open:rotate-90 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
          {label}
        </span>
        <span className="tabular-nums">{fmt(total)}</span>
      </summary>
      <div className="pb-2">
        {groups.length === 0 ? (
          <p className="px-5 pb-3 text-xs text-slate-400">No balances.</p>
        ) : (
          groups.map(g => <BalanceGroupCollapsible key={g.key} group={g} />)
        )}
      </div>
    </details>
  );
}

function BalanceGroupCollapsible({ group }: { group: BalanceSheetGroup }) {
  const hasRows = group.accounts.length > 0;
  return (
    <details className="group/sub border-t border-slate-100">
      <summary
        className={`list-none ${
          hasRows ? 'cursor-pointer' : 'cursor-default'
        } select-none pl-10 pr-5 py-2 flex items-center justify-between text-sm font-medium text-slate-800 hover:bg-slate-50/60 transition`}
      >
        <span className="inline-flex items-center gap-2">
          {hasRows && (
            <svg
              className="w-3 h-3 transition-transform group-open/sub:rotate-90 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M6.22 4.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 01-1.06-1.06L10.94 10 6.22 5.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {group.label}
          {group.synthetic && (
            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              derived
            </span>
          )}
        </span>
        <span className="tabular-nums">{fmt(group.total)}</span>
      </summary>
      {hasRows && (
        <table className="w-full text-[12px]">
          <tbody>
            {group.accounts.map((a, i) => (
              <tr
                key={`${group.key}:${a.code}:${a.name}:${i}`}
                className="text-slate-600 border-t border-slate-50"
              >
                <td className="pl-[4.5rem] pr-2 py-1 truncate max-w-[380px]" title={a.name}>
                  {a.code && (
                    <span className="font-mono text-[10px] text-slate-400 mr-2">
                      {a.code}
                    </span>
                  )}
                  {a.name}
                </td>
                <td className="pr-5 py-1 text-right tabular-nums">
                  {fmt(a.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'indigo' | 'slate' | 'rose' | 'amber';
}) {
  const toneClass =
    tone === 'indigo'
      ? 'text-indigo-700'
      : tone === 'rose'
        ? 'text-rose-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : 'text-slate-700';
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${toneClass}`}>{fmt(value)}</p>
    </div>
  );
}

function PayablesBlock({ payables }: { payables: PayablesReport }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <PayablesCard
        title="Vendors Payables"
        icon={<Wrench size={16} className="text-amber-600" />}
        accent="amber"
        data={payables.vendors}
      />
      <PayablesCard
        title="Employee Payables"
        icon={<Users size={16} className="text-indigo-600" />}
        accent="indigo"
        data={payables.employees}
      />
      <PayablesCard
        title="Owners Payables"
        icon={<HomeIcon size={16} className="text-rose-600" />}
        accent="rose"
        data={payables.owners}
      />
    </section>
  );
}

function PayablesCard({
  title,
  icon,
  accent,
  data,
}: {
  title: string;
  icon: React.ReactNode;
  accent: 'amber' | 'indigo' | 'rose';
  data: { total: number; partners: PayablePartnerRow[] };
}) {
  const tint =
    accent === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : accent === 'indigo'
        ? 'bg-indigo-50 text-indigo-700'
        : 'bg-rose-50 text-rose-700';
  return (
    <div className="ix-card p-5 space-y-3 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${tint}`}>
          {data.partners.length} {data.partners.length === 1 ? 'partner' : 'partners'}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums">{fmt(data.total)}</p>
      <div className="text-[11px] text-slate-500">Net outstanding (residual amount, EGP)</div>
      {data.partners.length === 0 ? (
        <div className="py-4 text-center text-slate-400 text-sm">No outstanding balances.</div>
      ) : (
        <div className="overflow-y-auto max-h-[360px] -mx-2">
          <table className="w-full text-sm">
            <tbody>
              {data.partners.slice(0, 40).map(p => (
                <tr key={p.partner_id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 truncate max-w-[200px]" title={p.partner_name}>
                    {p.partner_name}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(p.amount)}</td>
                </tr>
              ))}
              {data.partners.length > 40 && (
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-center text-[11px] text-slate-400">
                    …and {data.partners.length - 40} more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UnclassifiedPanel({ pnl }: { pnl: PnlReport }) {
  const total = pnl.unclassified.reduce((s, u) => s + u.balance, 0);
  return (
    <section className="ix-card p-5 space-y-3 bg-amber-50/40 border-amber-200">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Unclassified accounts ({pnl.unclassified.length}) · {fmtSigned(total)}
        </h3>
      </div>
      <div className="max-h-60 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {pnl.unclassified.map((u, i) => (
              <tr key={`${u.code}:${i}`} className="border-t border-amber-100">
                <td className="px-2 py-1 font-mono text-[11px] text-amber-800">{u.code || '—'}</td>
                <td className="px-2 py-1 text-slate-700">{u.name}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtSigned(u.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function getLatestSync() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('odoo_sync_runs')
    .select(
      'finished_at, status, move_lines_synced, accounts_synced, partners_synced, invoices_synced'
    )
    .eq('status', 'succeeded')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    finished_at: string;
    status: string;
    move_lines_synced: number;
    accounts_synced: number;
    partners_synced: number;
    invoices_synced: number;
  } | null;
}
