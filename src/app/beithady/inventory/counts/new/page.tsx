import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { listAllWarehouses } from '@/lib/beithady/inventory/warehouses';
import { CountSessionForm } from '../_components/count-session-form';

export const dynamic = 'force-dynamic';

export default async function NewCountSessionPage() {
  await requireBeithadyPermission('inventory', 'full');
  const warehouses = await listAllWarehouses({ includeInactive: false });

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Counts', href: '/beithady/inventory/counts' },
        { label: 'New' },
      ]}
      containerClass="max-w-2xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Counts · New"
        title="New count session"
        subtitle="Cycle = random sample of items in this warehouse. Physical = every stocked item. Both create open lines for cleaners to fill in counted_qty."
      />
      <CountSessionForm
        warehouses={warehouses.map(w => ({
          id: w.id,
          label: `${w.code} — ${w.name_en}`,
        }))}
      />
    </BeithadyShell>
  );
}
