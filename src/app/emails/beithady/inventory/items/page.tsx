import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryItemsPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Items / Catalog"
      subtitle="Item Master with manual entry, Excel import, and AI Amazon-EG URL paste."
      phase="M.4"
      description="Item Master tab. Add items manually, bulk-import via Excel (.xlsx template will be downloadable from this page), or paste an Amazon EG URL to auto-fill SKU/photo/cost via AI."
    />
  );
}
