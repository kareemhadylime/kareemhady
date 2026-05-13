import type { HKMonthResult } from '@/lib/beithady/hc-estimator-types';

export function HKWeeklyTable({ result }: { result: HKMonthResult }) {
  const monthTotalCheckins  = result.weeks.reduce((s, w) => s + w.projectedCheckins, 0);
  const monthTotalRollovers = result.weeks.reduce((s, w) => s + w.projectedRollovers, 0);
  const monthTotalStayInHrs = result.weeks.reduce((s, w) => s + w.stayInHrs, 0);
  const monthTotalAreasHrs  = result.weeks.reduce((s, w) => s + w.areasHrs, 0);
  const monthTotalHrs       = result.weeks.reduce((s, w) => s + w.totalHrs, 0);

  return (
    <div className="ix-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 text-left">
            <th className="py-2 px-3">Week</th>
            <th className="py-2 px-3 text-right">Check-ins</th>
            <th className="py-2 px-3 text-right">Rollovers</th>
            <th className="py-2 px-3 text-right">Stay-in HK-hrs</th>
            <th className="py-2 px-3 text-right">Areas HK-hrs</th>
            <th className="py-2 px-3 text-right">Total HK-hrs</th>
            <th className="py-2 px-3 text-right">Day HKs</th>
            <th className="py-2 px-3 text-center">Override</th>
            <th className="py-2 px-3 text-right">Night HKs</th>
            <th className="py-2 px-3 text-right">Supervisors</th>
          </tr>
        </thead>
        <tbody>
          {result.weeks.map(w => (
            <tr
              key={w.week}
              className={`border-b border-slate-100 dark:border-slate-800 ${w.week === result.peakWeek ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
            >
              <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300">{w.label}</td>
              <td className="py-2 px-3 text-right">{Math.round(w.projectedCheckins)}</td>
              <td className="py-2 px-3 text-right">{Math.round(w.projectedRollovers)}</td>
              <td className="py-2 px-3 text-right">{w.stayInHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right">{w.areasHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right">{w.totalHrs.toFixed(1)}</td>
              <td className="py-2 px-3 text-right font-semibold">{w.dayHKs}</td>
              <td className="py-2 px-3 text-center">
                {w.rolloverOverride ? (
                  <span
                    className="text-amber-600 font-bold cursor-help"
                    title={`${Math.round(w.projectedRollovers)} same-day rollovers require ${w.rolloverPeakHKs} concurrent HKs in the 11 AM–3 PM window (overrides peak-day baseline of ${w.rolloverBaselineHKs})`}
                  >
                    ⚠️
                  </span>
                ) : '—'}
              </td>
              <td className="py-2 px-3 text-right">{w.nightHKs}</td>
              <td className="py-2 px-3 text-right">{w.supervisors}</td>
            </tr>
          ))}
          <tr className="font-semibold text-slate-800 dark:text-slate-100 border-t-2 border-slate-300 dark:border-slate-600">
            <td className="py-2 px-3">Monthly</td>
            <td className="py-2 px-3 text-right">{Math.round(monthTotalCheckins)}</td>
            <td className="py-2 px-3 text-right">{Math.round(monthTotalRollovers)}</td>
            <td className="py-2 px-3 text-right">{monthTotalStayInHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{monthTotalAreasHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{monthTotalHrs.toFixed(1)}</td>
            <td className="py-2 px-3 text-right">{result.dayHKsOnShift}</td>
            <td className="py-2 px-3 text-center">—</td>
            <td className="py-2 px-3 text-right">{result.nightHKsOnShift}</td>
            <td className="py-2 px-3 text-right">{result.supervisorsOnShift}</td>
          </tr>
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800">
        <p>Table shows on-shift numbers. KPI cards show to-hire numbers (×7/6 coverage, 1 day off/week rotating).</p>
        <p>5% stay-in rate applied to projected occupied units. General areas hours are fixed (no multiplier).</p>
        <p className="text-amber-600">Highlighted row = peak week (drives monthly hiring recommendation).</p>
      </div>
    </div>
  );
}
