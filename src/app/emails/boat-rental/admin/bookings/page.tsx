import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function BookingsAdmin() {
  return (
    <TabPlaceholder
      title="All Bookings"
      description="Every reservation across all boats, filterable by status, broker, owner."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/bookings"
      bullets={[
        'Filter by boat · broker · owner · status · date range',
        'Drill-in to see trip details, payment status, notes, audit trail',
        'Admin-only actions: force-cancel past the 72h window · clear refund_pending flag',
        'Manual booking entry for comp/friends/family (blocks the date, no broker/payment)',
      ]}
    />
  );
}
