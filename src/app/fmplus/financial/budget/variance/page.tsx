import { redirect } from 'next/navigation';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';
import { PeriodControl } from '../_components/period-control';
import { VarianceGrid } from './_components/variance-grid';
import { getTemplate } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { ScenarioSchema } from '@/lib/fmplus/budget/schema';

export default async function VariancePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; year?: string; scenario?: string; through?: string; segment?: string }>;
}) {
  const sp = await searchParams;
  const projectId = Number(sp.project ?? 0);
  if (!projectId) redirect('/fmplus/financial/budget');
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const sParse = ScenarioSchema.safeParse(sp.scenario ?? 'initial');
  const scenario: Scenario = sParse.success ? sParse.data : 'initial';
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const activeSegmentId = sp.segment ? Number(sp.segment) : null;

  const report = await buildBudgetVariance({ projectId, fiscalYear: year, scenario, ytdThrough: through });

  if (!report) {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500">No budget for this project · year · scenario.</p>
        <a href={`/fmplus/financial/budget/edit?project=${projectId}&year=${year}&scenario=${scenario}`}
           className="inline-block px-3 py-2 rounded bg-amber-600 text-white text-sm">Create budget</a>
      </section>
    );
  }

  const seg = activeSegmentId
    ? report.segments.find(s => s.segment_id === activeSegmentId) ?? report.segments[0]
    : report.segments[0];

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">{report.project_name}</h2>
          <p className="text-xs text-slate-500">FY {report.fiscal_year} · Scenario: {report.scenario} · Status: {report.status} · Start month: {report.start_month}</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodControl />
          <a href={`/api/fmplus/budget/variance-xlsx?project=${projectId}&year=${year}&scenario=${scenario}&through=${through}`}
             className="text-sm px-3 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">⬇ XLSX</a>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Annual budget" value={fmt(report.segments.flatMap(s => s.categories.flatMap(c => c.cells)).reduce((sum, c) => sum + c.budget, 0))} />
        <KpiTile label="YTD budget" value={fmt(report.ytd.budget)} />
        <KpiTile label="YTD actual" value={fmt(report.ytd.actual)} />
        <KpiTile label="Variance" value={fmt(report.ytd.variance)} accent={report.ytd.color} />
        <KpiTile label="Variance %" value={fmtPct(report.ytd.variance_pct)} accent={report.ytd.color} />
      </div>

      {report.unmapped_actuals_total !== 0 && (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
          <strong>{fmt(report.unmapped_actuals_total)} EGP of actuals</strong> didn&apos;t match any category. Configure mappings in Settings.
        </div>
      )}

      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {report.segments.map(s => (
          <a key={s.segment_id}
             href={`?project=${projectId}&year=${year}&scenario=${scenario}&through=${through}&segment=${s.segment_id}`}
             className={`px-3 py-2 text-sm border-b-2 -mb-px ${seg?.segment_id === s.segment_id ? 'border-amber-600 text-amber-700 font-semibold' : 'border-transparent text-slate-500'}`}>
            {s.service_line.toUpperCase()}{s.is_stub ? ' (stub)' : ''}
          </a>
        ))}
      </nav>

      {seg?.is_stub ? (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
          {seg.service_line.toUpperCase()} template is not yet defined — variance cannot be computed for this segment.
        </div>
      ) : seg ? (
        <VarianceGrid
          projectId={projectId}
          year={year}
          serviceLine={seg.service_line}
          templateVersion={seg.template_version}
          template={getTemplate(seg.service_line, seg.template_version)}
          segment={seg}
          ytdThrough={through}
        />
      ) : (
        <p className="text-sm text-slate-500">No segments on this budget.</p>
      )}
    </section>
  );
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green'|'amber'|'red' }) {
  const border = accent === 'red' ? 'border-rose-500' : accent === 'amber' ? 'border-amber-500' : accent === 'green' ? 'border-emerald-500' : '';
  return (
    <div className={`rounded-lg p-3 bg-slate-50 dark:bg-slate-800 ${border ? `border-l-4 ${border}` : ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; }
