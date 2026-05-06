import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { KpiCards } from './_components/kpi-cards';
import { RevenueChart } from './_components/revenue-chart';

export const dynamic = 'force-dynamic';

export default async function FnbAnalyticsPage() {
  await requireBeithadyPermission('fnb', 'read');
  return (
    <>
      <KpiCards />
      <div className="mt-4">
        <RevenueChart />
      </div>
    </>
  );
}
