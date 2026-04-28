import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryCountsPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Counts & Adjustments"
      subtitle="Cycle counts (weekly subset) · Physical counts (quarterly). Variance → adjustment with reason code."
      phase="M.10"
      description="Schedule a count session (cycle = random subset, physical = entire warehouse). Cleaners enter counted qty via mobile or desktop. System computes variance, posts an adjustment transaction with reason after warehouse_manager approval."
    />
  );
}
