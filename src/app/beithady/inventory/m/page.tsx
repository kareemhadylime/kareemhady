import { readMobileSession, listBuildingChoices } from '@/lib/beithady/inventory/mobile-pin';
import { listItems } from '@/lib/beithady/inventory/catalog';
import { listStockBalances } from '@/lib/beithady/inventory/stock';
import { MobilePinLogin } from './_components/mobile-pin-login';
import { MobileHome } from './_components/mobile-home';

export const dynamic = 'force-dynamic';

// PIN-gated, NOT role-gated. Anyone with the building PIN can use it.
export default async function InventoryMobileEntry() {
  const session = await readMobileSession();

  if (!session) {
    const buildings = await listBuildingChoices();
    return <MobilePinLogin buildings={buildings} />;
  }

  // Authenticated session — load context
  const [items, stock] = await Promise.all([
    listItems({ status: 'active' }),
    listStockBalances({ warehouseId: session.warehouseId, status: 'in_stock' }),
  ]);

  // Per-item current on-hand at THIS warehouse only
  const onHandHere = new Map<string, number>();
  for (const s of stock) {
    if (s.warehouse_id === session.warehouseId) {
      onHandHere.set(s.item_id, (onHandHere.get(s.item_id) || 0) + s.qty_on_hand);
    }
  }

  const itemsForPicker = items
    .map(it => ({
      id: it.id,
      sku: it.sku,
      name_en: it.name_en,
      name_ar: it.name_ar,
      uom: it.uom,
      on_hand: onHandHere.get(it.id) || 0,
    }))
    .filter(it => it.on_hand > 0)
    .sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar'));

  return <MobileHome session={session} items={itemsForPicker} />;
}
