// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use client';
import { useState } from 'react';

export function CategoryBlock({
  category, label, subLocations, seasons, lineDefs,
  rowsByKey, onChange,
}: {
  category: string;
  label: string;
  subLocations: string[];
  seasons: ('high'|'low')[];
  lineDefs: Array<{ code: string; label: string }>;
  rowsByKey: Map<string, { qty: number; unit_cost: number }>;
  onChange: (key: string, qty: number, unit_cost: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const subs = subLocations.length === 0 ? [null] : subLocations;
  return (
    <section className="border border-slate-200 dark:border-slate-700 rounded">
      <button type="button" onClick={() => setOpen(o => !o)}
              className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="p-3 overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="text-left">
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Line</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Sub-location</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700">Season</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Qty</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Unit cost</th>
                <th className="p-1 border-b border-slate-200 dark:border-slate-700 text-right">Monthly</th>
              </tr>
            </thead>
            <tbody className="font-variant-numeric tabular-nums">
              {lineDefs.flatMap(line => subs.flatMap(sub => seasons.map(season => {
                const key = `${category}|${line.code}|${sub ?? ''}|${season}`;
                const cur = rowsByKey.get(key) ?? { qty: 0, unit_cost: 0 };
                const monthly = cur.qty * cur.unit_cost;
                return (
                  <tr key={key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="p-1">{line.label}</td>
                    <td className="p-1 text-slate-500">{sub ?? '—'}</td>
                    <td className="p-1 text-slate-500">{season}</td>
                    <td className="p-1 text-right">
                      <input type="number" step="0.01" min="0" defaultValue={cur.qty}
                             onBlur={e => onChange(key, Number(e.currentTarget.value), cur.unit_cost)}
                             className="w-20 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" />
                    </td>
                    <td className="p-1 text-right">
                      <input type="number" step="0.01" min="0" defaultValue={cur.unit_cost}
                             onBlur={e => onChange(key, cur.qty, Number(e.currentTarget.value))}
                             className="w-24 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" />
                    </td>
                    <td className="p-1 text-right text-slate-700 dark:text-slate-300">{monthly.toFixed(2)}</td>
                  </tr>
                );
              })))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
