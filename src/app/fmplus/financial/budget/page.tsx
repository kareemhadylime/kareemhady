// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import Link from 'next/link';
import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { PeriodControl } from './_components/period-control';
import { HealthDot } from './_components/health-dot';
import { AnomalyBanner } from './_components/anomaly-banner';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

export default async function BudgetOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; scenario?: string; through?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenario = (sp.scenario ?? 'initial') as Scenario;
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const sl = (sp.service_line ?? '') as ServiceLine | '';

  const { rows, totals, missing } = await buildPortfolio({
    fiscalYear: year, scenario, ytdThrough: through,
    serviceLineFilter: sl === '' ? null : sl,
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PeriodControl />
        <ServiceLineFilter selected={sl} year={year} scenario={scenario} through={through} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Projects budgeted" value={String(rows.length)} />
        <KpiTile label="YTD budget" value={fmt(totals.budget)} />
        <KpiTile label="YTD actual" value={fmt(totals.actual)} />
        <KpiTile label="Portfolio variance" value={fmtPct(totals.variance_pct)} accent />
      </div>

      <AnomalyBanner rows={rows} />

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800 text-left">
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Project</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Plan</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Services</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Budget YTD</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Actual YTD</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Var</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">Var %</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-center">Health</th>
            <th className="p-2 border-b border-slate-200 dark:border-slate-700">Status</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {rows.map(r => (
            <tr key={r.project_id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="p-2">
                <Link href={`/fmplus/financial/budget/variance?project=${r.project_id}&year=${year}&scenario=${scenario}&through=${through}`}
                      className="font-semibold text-amber-700 hover:underline">{r.project_name}</Link>
              </td>
              <td className="p-2 text-slate-500">{r.plan_label ?? '—'}</td>
              <td className="p-2">
                {r.service_lines.map(s => <span key={s} className="inline-block px-2 py-0.5 mr-1 text-[10px] rounded-full border border-amber-300 text-amber-700">{s}</span>)}
              </td>
              <td className="p-2 text-right">{fmt(r.budget_ytd)}</td>
              <td className="p-2 text-right">{fmt(r.actual_ytd)}</td>
              <td className={`p-2 text-right ${r.variance > 0 ? 'text-rose-600' : r.variance < 0 ? 'text-emerald-700' : ''}`}>{fmt(r.variance)}</td>
              <td className={`p-2 text-right ${r.health_color === 'red' ? 'text-rose-600' : r.health_color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(r.variance_pct)}</td>
              <td className="p-2 text-center"><HealthDot color={r.health_color} title={r.health_color} /></td>
              <td className="p-2 text-slate-500 capitalize">{r.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="p-6 text-center text-slate-500">No budgets for this filter. Use the Editor or Import tab to create one.</td></tr>
          )}
        </tbody>
      </table>

      {missing.length > 0 && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h2 className="text-sm font-semibold mb-2">Action needed — HK projects without a budget for FY {year}</h2>
          <ul className="text-sm space-y-1">
            {missing.map(m => (
              <li key={m.project_id} className="flex items-center justify-between">
                <span>{m.project_name}</span>
                <Link href={`/fmplus/financial/budget/edit?project=${m.project_id}&year=${year}&scenario=${scenario}`}
                      className="text-amber-700 hover:underline">Create budget &rarr;</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? 'border-l-4 border-amber-500' : ''} bg-slate-50 dark:bg-slate-800`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}
function fmtPct(p: number | null): string {
  if (p == null) return '—';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function ServiceLineFilter({ selected, year, scenario, through }: {
  selected: ServiceLine | ''; year: number; scenario: string; through: number;
}) {
  const options: Array<{ code: ServiceLine | ''; label: string }> = [
    { code: '', label: 'All service lines' },
    { code: 'hk', label: 'Housekeeping' },
    { code: 'mep', label: 'MEP' },
    { code: 'landscape', label: 'Landscape' },
    { code: 'security', label: 'Security' },
    { code: 'pest_ctrl', label: 'Pest Control' },
    { code: 'waste_mgmt', label: 'Waste Management' },
  ];
  const baseQuery = (sl: string) => {
    const params = new URLSearchParams();
    params.set('year', String(year));
    params.set('scenario', scenario);
    params.set('through', String(through));
    if (sl) params.set('service_line', sl);
    return `?${params.toString()}`;
  };
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {options.map(o => (
        <Link key={o.code} href={baseQuery(o.code)}
              className={`px-2 py-1 rounded-full border ${selected === o.code ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}
