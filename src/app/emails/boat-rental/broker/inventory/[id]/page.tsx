import { CatalogueDetail } from '../../../_components/catalogue/catalogue-detail';
import { BROKER_TABS } from '../../../_components/tabs';
import { requireBoatRoleOrThrow } from '@/lib/boat-rental/server-helpers';

export const dynamic = 'force-dynamic';

export default async function BrokerInventoryDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireBoatRoleOrThrow('broker');
  const { id } = await params;
  return (
    <CatalogueDetail
      boatId={id}
      scope={{ kind: 'active-only' }}
      basePath="/emails/boat-rental/broker/inventory"
      tabs={BROKER_TABS}
      currentPath="/emails/boat-rental/broker/inventory"
    />
  );
}
