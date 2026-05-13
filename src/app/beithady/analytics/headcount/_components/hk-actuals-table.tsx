import type { HKBaseData } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';

export function HKActualsTable({ base, projectedTotal }: {
  base: HKBaseData;
  projectedTotal: number;
}) {
  const buildingTotals = BUILDINGS.map(b => {
    const days = base.weeks.flatMap(w => w.days.filter(d => d.building === b));
    const checkins = days.reduce((sum, d) =>
      sum + d.checkins.studio + d.checkins.oneBR + d.checkins.twoBR + d.checkins.threeBR + d.checkins.fourBR, 0);
    const rollovers = days.reduce((sum, d) => sum + d.sameDayRollovers, 0);
    const stayIns = days.reduce((sum, d) => sum + d.stayIns, 0);
    const dayCount = new Set(days.map(d => d.date)).size;
    return {
      building: b,
      checkins,
      rollovers,
      avgStayIns: dayCount > 0 ? Math.round(stayIns / dayCount) : 0,
      studio:   days.reduce((s, d) => s + d.checkins.studio, 0),
      oneBR:    days.reduce((s, d) => s + d.checkins.oneBR, 0),
      twoBR:    days.reduce((s, d) => s + d.checkins.twoBR, 0),
      threeBR:  days.reduce((s, d) => s + d.checkins.threeBR, 0),
      fourBR:   days.reduce((s, d) => s + d.checkins.fourBR, 0),
    };
  });

  const totalActual = buildingTotals.reduce((s, b) => s + b.checkins, 0);

  return (
    <div className="ix-card p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {base.month} Actuals
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {totalActual} last month → <span className="font-semibold text-cyan-600">{projectedTotal} projected</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
              <th className="text-left py-1 pr-3">Building</th>
              <th className="text-right py-1 px-2">Studio</th>
              <th className="text-right py-1 px-2">1BR</th>
              <th className="text-right py-1 px-2">2BR</th>
              <th className="text-right py-1 px-2">3BR</th>
              <th className="text-right py-1 px-2">4BR</th>
              <th className="text-right py-1 px-2 font-semibold">Total</th>
              <th className="text-right py-1 px-2">Rollovers</th>
              <th className="text-right py-1 pl-2">Avg Stay-ins</th>
            </tr>
          </thead>
          <tbody>
            {buildingTotals.map(row => (
              <tr key={row.building} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1 pr-3 font-medium text-slate-700 dark:text-slate-300">{row.building}</td>
                <td className="text-right py-1 px-2">{row.studio}</td>
                <td className="text-right py-1 px-2">{row.oneBR}</td>
                <td className="text-right py-1 px-2">{row.twoBR}</td>
                <td className="text-right py-1 px-2">{row.threeBR}</td>
                <td className="text-right py-1 px-2">{row.fourBR}</td>
                <td className="text-right py-1 px-2 font-semibold">{row.checkins}</td>
                <td className="text-right py-1 px-2">{row.rollovers}</td>
                <td className="text-right py-1 pl-2">{row.avgStayIns}/day</td>
              </tr>
            ))}
            <tr className="font-semibold text-slate-800 dark:text-slate-100">
              <td className="py-1 pr-3">Total</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.studio}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.oneBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.twoBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.threeBR}</td>
              <td className="text-right py-1 px-2">{base.totalCheckins.fourBR}</td>
              <td className="text-right py-1 px-2">{totalActual}</td>
              <td className="text-right py-1 px-2">{base.totalRollovers}</td>
              <td className="text-right py-1 pl-2">{base.avgStayInsPerDay}/day</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
