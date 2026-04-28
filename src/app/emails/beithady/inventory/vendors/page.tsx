import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryVendorsPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Vendors / Registration"
      subtitle="KYC workflow · payment terms · banking · Amazon EG storefront URL · price-history graph."
      phase="M.5"
      description="Vendor Master with full registration workflow (draft → KYC → approved). 1 dummy approved vendor (Amazon EG) is seeded so the first GRN test isn't blocked. M.5 builds the full registration UI."
    />
  );
}
