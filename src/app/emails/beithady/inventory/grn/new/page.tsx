import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { listVendors } from '@/lib/beithady/inventory/vendors';
import { listAllWarehouses } from '@/lib/beithady/inventory/warehouses';
import { listItems } from '@/lib/beithady/inventory/catalog';
import { GrnDraftForm } from '../_components/grn-draft-form';

export const dynamic = 'force-dynamic';

export default async function NewGrnPage() {
  await requireBeithadyPermission('inventory', 'full');

  const [vendors, warehouses, items] = await Promise.all([
    listVendors({ status: 'approved' }),
    listAllWarehouses({ includeInactive: false }),
    listItems({ status: 'active' }),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/emails/beithady/inventory' },
        { label: 'Receiving (GRN)', href: '/emails/beithady/inventory/grn' },
        { label: 'New' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Receiving · New"
        title="New Goods Receipt Note"
        subtitle="Pick a vendor + warehouse, add line items with batch/expiry/QC photo, then submit. Approval routes per the configurable matrix; posting writes to the immutable ledger."
      />

      {vendors.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <p>No approved vendors yet.</p>
          <p className="text-[11px] mt-2">Visit <a href="/emails/beithady/inventory/vendors" className="text-cyan-700 underline">Vendors</a> to register one.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <p>No active items yet.</p>
          <p className="text-[11px] mt-2">Visit <a href="/emails/beithady/inventory/items" className="text-cyan-700 underline">Items</a> to add some (manual or Excel import).</p>
        </div>
      ) : (
        <GrnDraftForm
          vendors={vendors.map(v => ({
            id: v.id,
            label: `${v.code} — ${v.trade_name || v.legal_name}`,
            currency: v.default_currency,
          }))}
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
            default_cost_egp: it.default_cost_egp,
            batch_tracked: it.batch_tracked,
            expiry_tracked: it.expiry_tracked,
            primary_vendor_id: it.primary_vendor_id,
          }))}
        />
      )}
    </BeithadyShell>
  );
}
