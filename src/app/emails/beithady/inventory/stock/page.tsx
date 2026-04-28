import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryStockPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Stock"
      subtitle="Balance per item × warehouse × batch. Drill into transaction ledger for full history."
      phase="M.6"
      description="Stock browser with filters (building/warehouse/category/status). Drill into any item to see the immutable transaction ledger — every receipt, issue, transfer, and adjustment in chronological order."
    />
  );
}
