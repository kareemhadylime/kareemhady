'use client';

import { useState } from 'react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { MonthlyAvgCell } from '@/lib/beithady/hr/hr-headcount-types';

type Props = {
  initialRows: MonthlyAvgCell[];
  initialDaysRecorded: number;
};

const DISPLAY_BUILDINGS = BUILDING_CODES as readonly string[];

export function HeadcountMonthlyAvg({ initialRows, initialDaysRecorded }: Props) {
  const [rows, setRows]         = useState(initialRows);
  const [daysRecorded, setDays] = useState(initialDaysRecorded);
  const [month, setMonth]       = useState(new Date().toISOString().slice(0, 7));

  async function fetchMonth(m: string) {
    const res = await fetch(`/api/hr/headcount/monthly-avg?month=${m}`);
    if (res.ok) {
      const { rows: r, days_recorded } = await res.json() as {
        rows: MonthlyAvgCell[];
        days_recorded: number;
      };
      setRows(r);
      setDays(days_recorded);
    }
  }

  function handleMonth(v: string) { setMonth(v); fetchMonth(v); }

  // Build lookup
  const map = new Map<string, number>();
  for (const c of rows) map.set(`${c.building_code}__${c.department}`, c.avg_count);
  const cell = (b: string, d: string) => map.get(`${b}__${d}`) ?? 0;

  // Totals
  const rowTotal   = (d: string) => DISPLAY_BUILDINGS.reduce((s, b) => s + cell(b, d), 0);
  const colTotal   = (b: string) => DEPARTMENTS.reduce((s, d) => s + cell(b, d), 0);
  const grandTotal = DEPARTMENTS.reduce((s, d) => s + rowTotal(d), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/70">Monthly Averages</h2>
        <div className="flex items-center gap-3">
          {daysRecorded > 0 && (
            <span className="text-xs text-white/30">
              Based on {daysRecorded} day{daysRecorded !== 1 ? 's' : ''} of data
            </span>
          )}
          <input
            type="month"
            value={month}
            onChange={e => handleMonth(e.target.value)}
            className="ix-input text-sm py-1"
          />
        </div>
      </div>

      {daysRecorded === 0 ? (
        <p className="text-center text-white/30 italic py-8 border border-white/10 rounded-xl">
          No data recorded for this month yet.
        </p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                <th className="px-4 py-3 sticky left-0 bg-neutral-900">Department</th>
                {DISPLAY_BUILDINGS.map(b => (
                  <th key={b} className="px-3 py-3 text-center">
                    {BUILDING_LABELS[b as BuildingCode] ?? b}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-semibold text-white/60">Avg Total</th>
              </tr>
            </thead>
            <tbody>
              {DEPARTMENTS.map(dept => {
                const total = rowTotal(dept);
                return (
                  <tr key={dept} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-4 py-2 sticky left-0 bg-neutral-900 text-white/70 text-xs">
                      {DEPARTMENT_LABELS[dept as Department]}
                    </td>
                    {DISPLAY_BUILDINGS.map(b => {
                      const n = cell(b, dept);
                      return (
                        <td key={b} className={`px-3 py-2 text-center text-sm ${n === 0 ? 'text-white/20' : 'text-white/80'}`}>
                          {n === 0 ? '—' : n.toFixed(1)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-center text-sm font-semibold ${total === 0 ? 'text-white/20' : 'text-white'}`}>
                      {total === 0 ? '—' : total.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/20 bg-white/3">
                <td className="px-4 py-2.5 sticky left-0 bg-neutral-900 text-xs font-semibold text-white/60 uppercase tracking-wide">
                  Avg Total
                </td>
                {DISPLAY_BUILDINGS.map(b => {
                  const n = colTotal(b);
                  return (
                    <td key={b} className={`px-3 py-2.5 text-center text-sm font-semibold ${n === 0 ? 'text-white/20' : 'text-emerald-400'}`}>
                      {n === 0 ? '—' : n.toFixed(1)}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center text-sm font-bold text-emerald-300">
                  {grandTotal.toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}