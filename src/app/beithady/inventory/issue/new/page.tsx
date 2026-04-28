import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { listAllWarehouses } from '@/lib/beithady/inventory/warehouses';
import { listItems } from '@/lib/beithady/inventory/catalog';
import { IssueDraftForm } from '../_components/issue-draft-form';

export const dynamic = 'force-dynamic';

export default async function NewIssuePage() {
  await requireBeithadyPermission('inventory', 'full');

  const [warehouses, items] = await Promise.all([
    listAllWarehouses({ includeInactive: false }),
    listItems({ status: 'active' }),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Dispensing (Issue)', href: '/beithady/inventory/issue' },
        { label: 'New' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Dispensing · New"
        title="New Issue"
        subtitle="Pick the issue type, warehouse, and lines. FIFO batch picking on posting (oldest expiry first)."
      />

      {items.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          No active items. Add items first via <a href="/beithady/inventory/items" className="text-cyan-700 underline">Items</a>.
        </div>
      ) : (
        <IssueDraftForm
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
            total_on_hand: it.total_on_hand,
          }))}
        />
      )}
    </BeithadyShell>
  );
}
