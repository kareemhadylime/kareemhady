// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use client';
import type { FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
export function PreviewGrid({ rows }: { rows: FlatRow[] }) {
  const limited = rows.slice(0, 200);
  return (
    <div className="overflow-x-auto max-h-96 border border-slate-200 dark:border-slate-700 rounded">
      <table className="text-xs w-full">
        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
          <tr>
            <th className="p-1.5 text-left">Service</th>
            <th className="p-1.5 text-left">Sub-loc</th>
            <th className="p-1.5 text-left">Category</th>
            <th className="p-1.5 text-left">Line</th>
            <th className="p-1.5 text-left">Season</th>
            <th className="p-1.5 text-right">Qty</th>
            <th className="p-1.5 text-right">Unit cost</th>
            <th className="p-1.5 text-right">Monthly</th>
          </tr>
        </thead>
        <tbody className="font-variant-numeric tabular-nums">
          {limited.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
              <td className="p-1.5">{r.service_line}</td>
              <td className="p-1.5 text-slate-500">{r.sub_location ?? '—'}</td>
              <td className="p-1.5">{r.category}</td>
              <td className="p-1.5">{r.line_code}</td>
              <td className="p-1.5">{r.season}</td>
              <td className="p-1.5 text-right">{r.qty}</td>
              <td className="p-1.5 text-right">{r.unit_cost.toLocaleString()}</td>
              <td className="p-1.5 text-right">{(r.qty * r.unit_cost).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && <p className="p-2 text-xs text-slate-500">Showing first 200 of {rows.length} rows.</p>}
    </div>
  );
}
