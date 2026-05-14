// src/app/beithady/hr/headcount/_components/headcount-grid.tsx
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { GridCell } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { cells: GridCell[] };

const DISPLAY_BUILDINGS = BUILDING_CODES as readonly BuildingCode[];

export function HeadcountGrid({ cells }: Props) {
  // Build lookup map
  const map = new Map<string, number>();
  for (const c of cells) {
    map.set(`${c.building_code}__${c.department}`, c.count);
  }
  const cell = (b: string, d: string) => map.get(`${b}__${d}`) ?? 0;

  // Column totals (per building)
  const colTotal = (b: string) => DEPARTMENTS.reduce((s, d) => s + cell(b, d), 0);
  // Row totals (per department)
  const rowTotal = (d: string) => DISPLAY_BUILDINGS.reduce((s, b) => s + cell(b, d), 0);
  // Grand total
  const grandTotal = DEPARTMENTS.reduce((s, d) => s + rowTotal(d), 0);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Live Headcount — Today</h2>
      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3 sticky left-0 bg-neutral-900">Department</th>
              {DISPLAY_BUILDINGS.map(b => (
                <th key={b} className="px-3 py-3 text-center">{BUILDING_LABELS[b]}</th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-white/60">Total</th>
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
                      <td key={b} className={`px-3 py-2 text-center text-sm ${n === 0 ? 'text-white/20' : 'text-white font-medium'}`}>
                        {n === 0 ? '—' : n}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-center text-sm font-semibold ${total === 0 ? 'text-white/20' : 'text-white'}`}>
                    {total === 0 ? '—' : total}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 bg-white/3">
              <td className="px-4 py-2.5 sticky left-0 bg-neutral-900 text-xs font-semibold text-white/60 uppercase tracking-wide">
                Total
              </td>
              {DISPLAY_BUILDINGS.map(b => {
                const n = colTotal(b);
                return (
                  <td key={b} className={`px-3 py-2.5 text-center text-sm font-semibold ${n === 0 ? 'text-white/20' : 'text-emerald-400'}`}>
                    {n === 0 ? '—' : n}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-center text-sm font-bold text-emerald-300">
                {grandTotal}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
