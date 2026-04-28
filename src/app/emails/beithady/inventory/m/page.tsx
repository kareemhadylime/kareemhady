import { InventoryComingSoon } from '../_components/coming-soon';

export const dynamic = 'force-dynamic';

// Mobile cleaner app — PIN-gated, NOT role-gated. requireBeithadyPermission
// is intentionally not called here; M.12 ships the PIN-validation entry flow.
export default async function InventoryMobileEntry() {
  return (
    <InventoryComingSoon
      title="Mobile cleaner app"
      subtitle="Arabic RTL · building-shared 6-digit PIN gate · big buttons · photo capture."
      phase="M.12"
      description="The cleaner-facing tablet app. Auth = building PIN (seeded in M.1, rotatable from settings). Per-session free-text name capture for audit trail. Posts back as inventory_issue rows tagged created_via='mobile_pin'."
    />
  );
}
