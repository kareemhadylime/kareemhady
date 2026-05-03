import type { DashboardReport } from '@/lib/fmplus/types';

export function DashboardCharts({ data }: { data: DashboardReport }) {
  return (
    <section className="ix-card p-4 text-xs text-slate-500">
      Charts pending Task 20. Trend points: {data.trend.length} · Service mix entries: {data.costMix.length} · Top projects: {data.topProjects.length}
    </section>
  );
}
