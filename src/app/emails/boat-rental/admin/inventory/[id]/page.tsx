import { CatalogueDetail } from '../../../_components/catalogue/catalogue-detail';
import { BackToAdminMenu } from '../../_components/back-to-menu';
import { requireBoatAdmin } from '@/lib/boat-rental/server-helpers';

export const dynamic = 'force-dynamic';

export default async function AdminInventoryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireBoatAdmin();
  const { id } = await params;
  return (
    <>
      <BackToAdminMenu href="/emails/boat-rental/admin/inventory" label="Back to Catalogue" />
      <CatalogueDetail
        boatId={id}
        scope={{ kind: 'all' }}
        basePath="/emails/boat-rental/admin/inventory"
        tabs={[]}
        currentPath="/emails/boat-rental/admin/inventory"
      />
    </>
  );
}
