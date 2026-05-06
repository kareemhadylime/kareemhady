import type { DashboardReport } from '@/lib/fmplus/types';
import { KpiStrip } from './KpiStrip';
import { DashboardCharts } from './DashboardCharts';

export function Dashboard({ data }: { data: DashboardReport }) {
  return (
    <div className="space-y-6">
      <KpiStrip kpis={data.kpis} />
      <DashboardCharts data={data} />
    </div>
  );
}
