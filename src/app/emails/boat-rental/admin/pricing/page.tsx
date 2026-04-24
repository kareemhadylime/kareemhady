import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function PricingAdmin() {
  return (
    <TabPlaceholder
      title="Pricing"
      description="Net-to-owner amounts per boat for weekday, weekend, and season tiers."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/pricing"
      bullets={[
        'Three tiers per boat: weekday · weekend (Fri-Sat) · season',
        'Amount = net-to-owner EGP (what broker transfers after trip)',
        'Prices snapshotted onto reservations — edits never affect past bookings',
      ]}
    />
  );
}
