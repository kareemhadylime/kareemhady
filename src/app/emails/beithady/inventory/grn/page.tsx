import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryGrnPage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Receiving (GRN)"
      subtitle="Goods Receipt Notes. Vendor → PO match → lines with batch/expiry → QC photos → approval → posting."
      phase="M.7"
      description="GRN workflow: Draft → Submitted → [if value > threshold] Pending Approval → Approved → Posted (immutable). Posting writes to the transactions ledger and recomputes weighted-average cost per item."
    />
  );
}
