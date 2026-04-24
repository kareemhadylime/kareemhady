import { TabPlaceholder } from '../../_components/placeholder';
import { BROKER_TABS } from '../../_components/tabs';

export default function BrokerHolds() {
  return (
    <TabPlaceholder
      title="Active Holds"
      description="Your unconfirmed 2-hour reservations — confirm once the client pays."
      tabs={BROKER_TABS}
      currentPath="/emails/boat-rental/broker/holds"
      bullets={[
        'Countdown timer until hold expires',
        'Notes field — capture special trip requirements (goes on the confirmation WhatsApp)',
        '"Mark Client Paid" confirms the booking and fires WhatsApp to owner',
        'Cancel before expiry — no trace except in audit log',
      ]}
    />
  );
}
