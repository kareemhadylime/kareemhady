import { CatalogueGrid } from '../../_components/catalogue/catalogue-grid';
import { OWNER_TABS } from '../../_components/tabs';
import { requireBoatRoleOrThrow } from '@/lib/boat-rental/server-helpers';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';

export const dynamic = 'force-dynamic';

export default async function OwnerInventory() {
  const me = await requireBoatRoleOrThrow('owner');
  const ownerIds = await getOwnedOwnerIds(me);
  return (
    <CatalogueGrid
      scope={{ kind: 'own-only', ownerIds }}
      basePath="/emails/boat-rental/owner/inventory"
      tabs={OWNER_TABS}
      currentPath="/emails/boat-rental/owner/inventory"
    />
  );
}
