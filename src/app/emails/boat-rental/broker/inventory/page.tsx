import { CatalogueGrid } from '../../_components/catalogue/catalogue-grid';
import { BROKER_TABS } from '../../_components/tabs';
import { requireBoatRoleOrThrow } from '@/lib/boat-rental/server-helpers';

export const dynamic = 'force-dynamic';

export default async function BrokerInventory() {
  await requireBoatRoleOrThrow('broker');
  return (
    <CatalogueGrid
      scope={{ kind: 'active-only' }}
      basePath="/emails/boat-rental/broker/inventory"
      tabs={BROKER_TABS}
      currentPath="/emails/boat-rental/broker/inventory"
    />
  );
}
