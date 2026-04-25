import { CatalogueDetail } from '../../../_components/catalogue/catalogue-detail';
import { OWNER_TABS } from '../../../_components/tabs';
import { requireBoatRoleOrThrow } from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';

export const dynamic = 'force-dynamic';

export default async function OwnerInventoryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireBoatRoleOrThrow('owner');
  const ownerIds = await getOwnedOwnerIds(me);
  const { id } = await params;
  return (
    <CatalogueDetail
      boatId={id}
      scope={{ kind: 'own-only', ownerIds }}
      basePath="/emails/boat-rental/owner/inventory"
      tabs={OWNER_TABS}
      currentPath="/emails/boat-rental/owner/inventory"
    />
  );
}
