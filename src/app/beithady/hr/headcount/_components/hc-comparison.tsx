// src/app/beithady/hr/headcount/_components/hc-comparison.tsx
import { BUILDING_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode } from '@/lib/beithady/hr/hr-types';
import { calcHcDelta } from '@/lib/beithady/hr/hr-headcount-types';
import type { HcComparisonData } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { data: HcComparisonData };

export function HcComparison({ data }: Props) {
  const delta = calcHcDelta(data.total_hk_actual, data.total_hk_planned);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Operational Staffing — HK & Security</h2>
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3 text-center">HK On-Job</th>
              <th className="px-4 py-3 text-center">Security On-Job</th>
            </tr>
          </thead>
          <tbody>
            {data.buildings.map(b => (
              <tr key={b.building_code} className="border-b border-white/5 hover:bg-white/3">
                <td className="px-4 py-2.5 text-white/70 text-sm">
                  {BUILDING_LABELS[b.building_code as BuildingCode] ?? b.building_code}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-sm font-medium ${b.hk_actual === 0 ? 'text-white/20' : 'text-white'}`}>
                    {b.hk_actual === 0 ? '—' : b.hk_actual}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-sm font-medium ${b.security_actual === 0 ? 'text-white/20' : 'text-white'}`}>
                    {b.security_actual === 0 ? '—' : b.security_actual}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20 bg-white/3">
              <td className="px-4 py-2.5 text-xs font-semibold text-white/60 uppercase tracking-wide">
                Portfolio Total
              </td>
              <td className="px-4 py-2.5 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-sm font-bold text-white">{data.total_hk_actual}</span>
                  {data.total_hk_planned !== null ? (
                    <span className="text-xs text-white/40">
                      of {data.total_hk_planned} planned
                      {delta !== null && (
                        <span className={`ml-1 font-semibold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          ({delta >= 0 ? '+' : ''}{delta})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-white/30">no HC snapshot</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 text-center">
                <span className="text-sm font-bold text-white">{data.total_security_actual}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
