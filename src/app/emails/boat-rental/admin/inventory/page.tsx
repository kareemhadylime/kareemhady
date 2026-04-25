import { CatalogueGrid } from '../../_components/catalogue/catalogue-grid';
import { BackToAdminMenu } from '../_components/back-to-menu';
import { requireBoatAdmin } from '@/lib/boat-rental/server-helpers';

export const dynamic = 'force-dynamic';

export default async function AdminInventory() {
  await requireBoatAdmin();
  return (
    <>
      <BackToAdminMenu href="/emails/boat-rental/admin" label="Back to admin menu" />
      <CatalogueGrid
        scope={{ kind: 'all' }}
        basePath="/emails/boat-rental/admin/inventory"
        tabs={[]}
        currentPath="/emails/boat-rental/admin/inventory"
      />
    </>
  );
}
