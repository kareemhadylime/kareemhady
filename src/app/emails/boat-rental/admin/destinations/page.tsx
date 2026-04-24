import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function DestinationsAdmin() {
  return (
    <TabPlaceholder
      title="Destinations"
      description="List of places brokers can pick from when filling trip details the day before."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/destinations"
      bullets={[
        'Simple list of destination names',
        'Shown as dropdown on the broker trip-details form',
        'Inactive destinations are hidden from new bookings but preserved on historical ones',
      ]}
    />
  );
}
