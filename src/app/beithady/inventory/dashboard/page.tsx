import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryDashboardPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Dashboard"
      subtitle="KPIs · per-checkin cost calculator · 30-day forecast · reorder alerts · stockout risk."
      phase="M.11"
      description="The Dashboard ships once enough core flows (warehouses, items, GRN, issue) are live to feed real KPIs. Per-checkin cost calculator and 30-day forecast widgets bake in here too."
    />
  );
}
