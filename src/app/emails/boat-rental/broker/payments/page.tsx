import { TabPlaceholder } from '../../_components/placeholder';
import { BROKER_TABS } from '../../_components/tabs';

export default function BrokerPayments() {
  return (
    <TabPlaceholder
      title="Payment Confirmation"
      description="After the trip, upload proof of the net-to-owner transfer."
      tabs={BROKER_TABS}
      currentPath="/emails/boat-rental/broker/payments"
      bullets={[
        'Completed trips waiting for receipt upload',
        'Enter transferred amount (EGP) + upload receipt (JPG/PDF)',
        'Fires WhatsApp to owner confirming transfer',
        'Past payments visible in read-only mode',
      ]}
    />
  );
}
