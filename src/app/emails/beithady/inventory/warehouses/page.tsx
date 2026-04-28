import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryWarehousesPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Warehouses"
      subtitle="Tree view per building (BH-26/73/435/OK/34/OTHER) → main warehouse → sub-warehouses."
      phase="M.3"
      description="6 main warehouses are seeded (one per building including OTHER). M.3 adds the tree CRUD UI for adding sub-warehouses, assigning managers, and editing PINs."
    />
  );
}
