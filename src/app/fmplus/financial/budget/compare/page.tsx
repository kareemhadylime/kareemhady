import { buildPortfolio } from '@/lib/fmplus/budget/portfolio';
import { CompareGrid } from './_components/compare-grid';
import { PeriodControl } from '../_components/period-control';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; scenario?: string; through?: string; service_line?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const scenario = (sp.scenario ?? 'initial') as Scenario;
  const through = Number(sp.through ?? new Date().getUTCMonth() + 1);
  const sl: ServiceLine = (sp.service_line ?? 'hk') as ServiceLine;

  const { rows } = await buildPortfolio({
    fiscalYear: year, scenario, ytdThrough: through, serviceLineFilter: sl,
  });

  // For each row, also fetch per-category variance %
  const enriched = await Promise.all(rows.map(async r => {
    const v = await buildBudgetVariance({ projectId: r.project_id, fiscalYear: year, scenario, ytdThrough: through });
    const seg = v?.segments.find(s => s.service_line === sl);
    const byCat = new Map<string, number | null>();
    for (const c of seg?.categories ?? []) {
      byCat.set(c.category, c.ytd.variance_pct);
    }
    return { ...r, by_category: byCat };
  }));

  return (
    <section className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Compare projects</h2>
          <p className="text-xs text-slate-500">Service line: <strong className="uppercase">{sl}</strong> · {enriched.length} projects ranked by absolute variance %.</p>
        </div>
        <PeriodControl />
      </header>
      <div className="flex gap-2 flex-wrap">
        {(['hk','mep','landscape','security','pest_ctrl','waste_mgmt'] as ServiceLine[]).map(s => (
          <a key={s}
             href={`?year=${year}&scenario=${scenario}&through=${through}&service_line=${s}`}
             className={`px-3 py-1 rounded-full text-xs ${sl === s ? 'bg-amber-600 text-white' : 'border border-slate-300 dark:border-slate-700 text-slate-500'}`}>
            {s.toUpperCase()}
          </a>
        ))}
      </div>
      <CompareGrid rows={enriched} />
    </section>
  );
}
