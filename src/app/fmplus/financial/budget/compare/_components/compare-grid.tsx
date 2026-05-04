// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import Link from 'next/link';

const CATEGORY_ORDER = ['manning', 'ppe', 'tools', 'consumables', 'transport', 'it', 'overhead'];

export function CompareGrid({ rows }: {
  rows: Array<{
    project_id: number; project_name: string;
    variance_pct: number | null;
    by_category: Map<string, number | null>;
    health_color: 'green' | 'amber' | 'red';
  }>;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No projects with budgets for this service line.</p>;
  const allCategories = Array.from(new Set(rows.flatMap(r => Array.from(r.by_category.keys()))))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800">
            <th className="p-2 text-left border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Project</th>
            {allCategories.map(c => <th key={c} className="p-2 text-right border-b border-slate-200 dark:border-slate-700 capitalize">{c}</th>)}
            <th className="p-2 text-right border-b border-slate-200 dark:border-slate-700 font-bold">Total Var %</th>
            <th className="p-2 text-center border-b border-slate-200 dark:border-slate-700">Health</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {rows.map(r => (
            <tr key={r.project_id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-2 font-semibold sticky left-0 bg-white dark:bg-slate-900">
                <Link href={`/fmplus/financial/budget/variance?project=${r.project_id}`} className="text-amber-700 hover:underline">{r.project_name}</Link>
              </td>
              {allCategories.map(c => {
                const pct = r.by_category.get(c) ?? null;
                return <td key={c} className={`p-2 text-right ${cellBg(pct)}`}>{fmtPct(pct)}</td>;
              })}
              <td className={`p-2 text-right font-semibold ${r.variance_pct == null ? '' : r.variance_pct > 15 ? 'text-rose-600' : Math.abs(r.variance_pct) <= 5 ? 'text-emerald-700' : 'text-amber-600'}`}>{fmtPct(r.variance_pct)}</td>
              <td className="p-2 text-center">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.health_color === 'red' ? 'bg-rose-500' : r.health_color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500 mt-2">Color rule: |var| ≤ 5% green · &gt;15% overspend red · everything else amber (incl. underspend &gt; 5%, scope-delivery risk).</p>
    </div>
  );
}

function cellBg(pct: number | null): string {
  if (pct == null) return '';
  if (pct > 15) return 'bg-rose-100/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
  if (Math.abs(pct) <= 5) return 'bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300';
  return 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
}

function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(0)}%`; }
