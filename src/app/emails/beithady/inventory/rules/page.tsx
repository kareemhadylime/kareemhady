import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryRulesPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Consumption rules"
      subtitle="Auto-issue formulas (Phase L engine integrated into M)."
      phase="M.8"
      description="Rules editor for the consumption engine. Scopes: global, building, listing, category. Formulas: per_guest_per_night, per_night, per_checkin, per_2_guests_per_night, fixed_per_stay. Loss factor default 12%."
    />
  );
}
