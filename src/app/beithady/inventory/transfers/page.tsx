import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryTransfersPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Transfers"
      subtitle="Warehouse-to-warehouse moves. Out → In pair with in-transit visibility."
      phase="M.9"
      description="Two-step transfer: Out (decrements source) → In (increments destination). In-transit qty visible separately so cycle counts don't double-count moving stock."
    />
  );
}
