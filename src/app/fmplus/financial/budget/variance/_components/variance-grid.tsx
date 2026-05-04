// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use client';
import { useState } from 'react';
import type { SegmentVariance } from '@/lib/fmplus/budget/types';
import type { Template } from '@/lib/fmplus/budget/templates';
import { DrillDrawer } from './drill-drawer';

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];

export function VarianceGrid({
  projectId, year, serviceLine, templateVersion, template, segment, ytdThrough,
}: {
  projectId: number; year: number; serviceLine: string; templateVersion: number;
  template: Template; segment: SegmentVariance; ytdThrough: number;
}) {
  const [drill, setDrill] = useState<{ category: string; month: number } | null>(null);
  const lowSet = new Set(template.schema_json.season_months.low);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="p-1.5 text-left border-b border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Category</th>
              {MONTHS.map(m => (
                <th key={m} className={`p-1.5 text-right border-b border-slate-200 dark:border-slate-700 ${lowSet.has(m) ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
                  {new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}
                </th>
              ))}
              <th className="p-1.5 text-right border-b border-slate-200 dark:border-slate-700 font-bold">YTD</th>
              <th className="p-1.5 text-right border-b border-slate-200 dark:border-slate-700 text-slate-500">Var %</th>
            </tr>
          </thead>
          <tbody className="font-variant-numeric tabular-nums">
            {segment.categories.map(cat => (
              <tr key={cat.category} className="border-b border-slate-100 dark:border-slate-800">
                <td className="p-1.5 font-semibold sticky left-0 bg-white dark:bg-slate-900">{labelFor(cat.category, template)}</td>
                {MONTHS.map(m => {
                  const cell = cat.cells.find(c => c.month === m);
                  if (!cell) return <td key={m} className={`p-1.5 text-right text-slate-400 ${lowSet.has(m) ? 'bg-slate-100/50 dark:bg-slate-700/50' : ''}`}>—</td>;
                  return (
                    <td key={m}
                        onClick={() => setDrill({ category: cat.category, month: m })}
                        className={`p-1.5 text-right cursor-pointer ${cellBg(cell.color)} ${lowSet.has(m) ? 'border-l border-slate-300 dark:border-slate-600' : ''}`}
                        title={`B ${fmt(cell.budget)} · A ${fmt(cell.actual)} · ${fmtPct(cell.variance_pct)}`}>
                      <div>{fmtK(cell.budget)}</div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmtK(cell.actual)}</div>
                    </td>
                  );
                })}
                <td className="p-1.5 text-right font-semibold">
                  <div>{fmt(cat.ytd.budget)}</div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmt(cat.ytd.actual)}</div>
                </td>
                <td className={`p-1.5 text-right ${cat.ytd.color === 'red' ? 'text-rose-600' : cat.ytd.color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(cat.ytd.variance_pct)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-300 dark:border-slate-600">
              <td className="p-2 sticky left-0 bg-slate-50 dark:bg-slate-800">{serviceLine.toUpperCase()} total</td>
              {MONTHS.map(m => {
                const sum = segment.categories.reduce((a, c) => a + (c.cells.find(x => x.month === m)?.budget ?? 0), 0);
                const sumA = segment.categories.reduce((a, c) => a + (c.cells.find(x => x.month === m)?.actual ?? 0), 0);
                return (
                  <td key={m} className={`p-1.5 text-right ${lowSet.has(m) ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
                    <div>{fmtK(sum)}</div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmtK(sumA)}</div>
                  </td>
                );
              })}
              <td className="p-2 text-right">
                <div>{fmt(segment.ytd.budget)}</div>
                <div className="text-[10px] text-slate-600 dark:text-slate-400">/ {fmt(segment.ytd.actual)}</div>
              </td>
              <td className={`p-2 text-right ${segment.ytd.color === 'red' ? 'text-rose-600' : segment.ytd.color === 'amber' ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtPct(segment.ytd.variance_pct)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Click any cell to see the underlying Odoo journal entries. Low-season columns shaded.</p>

      {drill && (
        <DrillDrawer
          projectId={projectId} year={year}
          serviceLine={serviceLine} templateVersion={templateVersion}
          category={drill.category} month={drill.month}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function labelFor(catCode: string, template: Template): string {
  return template.schema_json.categories.find(c => c.code === catCode)?.label ?? catCode;
}
function cellBg(color: 'green'|'amber'|'red'): string {
  if (color === 'red')   return 'bg-rose-100/70 dark:bg-rose-900/30';
  if (color === 'amber') return 'bg-amber-100/70 dark:bg-amber-900/30';
  return 'bg-emerald-50/70 dark:bg-emerald-900/20';
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
function fmtK(n: number): string { return n >= 10000 ? `${Math.round(n/1000)}k` : n.toFixed(0); }
function fmtPct(p: number | null): string { if (p == null) return '—'; return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`; }
