import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { listAllWarehouses } from '@/lib/beithady/inventory/warehouses';
import { listItems } from '@/lib/beithady/inventory/catalog';
import { listStockBalances } from '@/lib/beithady/inventory/stock';
import { TransferForm } from '../_components/transfer-form';

export const dynamic = 'force-dynamic';

export default async function NewTransferPage() {
  await requireBeithadyPermission('inventory', 'full');

  const [warehouses, items, stock] = await Promise.all([
    listAllWarehouses({ includeInactive: false }),
    listItems({ status: 'active' }),
    listStockBalances({ status: 'in_stock' }),
  ]);

  // Per-warehouse stock map for live "available" hints
  const stockByWarehouseAndItem: Record<string, Record<string, number>> = {};
  for (const s of stock) {
    if (!s.warehouse_id) continue;
    if (!stockByWarehouseAndItem[s.warehouse_id]) stockByWarehouseAndItem[s.warehouse_id] = {};
    stockByWarehouseAndItem[s.warehouse_id][s.item_id] =
      (stockByWarehouseAndItem[s.warehouse_id][s.item_id] || 0) + s.qty_on_hand;
  }

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Transfers', href: '/beithady/inventory/transfers' },
        { label: 'New' },
      ]}
      containerClass="max-w-4xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Transfers · New"
        title="New transfer"
        subtitle="Move stock between two warehouses. FIFO source pick (oldest expiry first). Atomic — both legs commit or neither. Posts immediately."
      />

      <TransferForm
        warehouses={warehouses.map(w => ({
          id: w.id,
          label: `${w.code} — ${w.name_en}`,
          building_code: w.building_code,
        }))}
        items={items.map(it => ({
          id: it.id,
          sku: it.sku,
          name_en: it.name_en,
          uom: it.uom,
        }))}
        stockByWarehouseAndItem={stockByWarehouseAndItem}
      />
    </BeithadyShell>
  );
}
