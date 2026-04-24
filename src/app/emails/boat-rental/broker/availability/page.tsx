import { TabPlaceholder } from '../../_components/placeholder';
import { BROKER_TABS } from '../../_components/tabs';

export default function BrokerAvailability() {
  return (
    <TabPlaceholder
      title="Check Availability"
      description="Pick a boat and date to see if it's available and at what price."
      tabs={BROKER_TABS}
      currentPath="/emails/boat-rental/broker/availability"
      bullets={[
        'Dropdown: boat · Date picker: booking date',
        'Response: "Available · EGP X (tier)" or "Booked"',
        'One-click Reserve → creates a 2-hour hold',
        'Hold countdown shown in the header until you confirm payment',
      ]}
    />
  );
}
