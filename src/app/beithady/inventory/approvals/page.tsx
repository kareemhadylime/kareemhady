import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryApprovalsPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Approvals inbox"
      subtitle="One unified inbox for GRN/Issue/PO/Adjustment/Transfer/Count items awaiting your approval."
      phase="M.7+"
      description="As GRN (M.7) and Issue (M.8) ship, this inbox fills up with items routed to your role per the configurable approval matrix (10 default rules seeded in M.1). One-click approve/reject with audit log."
    />
  );
}
