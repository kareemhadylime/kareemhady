import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

export default async function InventoryIssuePage() {
  await requireBeithadyPermission('inventory', 'read');
  return (
    <InventoryComingSoon
      title="Dispensing (Issue)"
      subtitle="6 types: per-reservation (auto-rules), maintenance, welcome tray, owner request, damage write-off, transfer out."
      phase="M.8"
      description="Issue workflow with 6 types and Welcome Tray Kits. Auto-issue rules engine fires from a daily cron (Cairo ~14:00) for reservations checking in today. Idempotency via DB unique constraint."
    />
  );
}
