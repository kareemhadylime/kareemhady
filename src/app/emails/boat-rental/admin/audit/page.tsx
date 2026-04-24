import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function AuditAdmin() {
  return (
    <TabPlaceholder
      title="Audit Log"
      description="Every state transition on every reservation, with actor and timestamp."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/audit"
      bullets={[
        'Create hold · confirm payment · fill details · receipt uploaded · owner mark paid · cancel',
        'Filter by reservation · actor · action type · date range',
        'Source of truth for disputes',
      ]}
    />
  );
}
