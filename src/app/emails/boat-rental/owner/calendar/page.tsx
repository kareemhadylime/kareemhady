import { TabPlaceholder } from '../../_components/placeholder';
import { OWNER_TABS } from '../../_components/tabs';

export default function OwnerCalendar() {
  return (
    <TabPlaceholder
      title="Calendar"
      description="Month grid per boat with color-coded booking states."
      tabs={OWNER_TABS}
      currentPath="/emails/boat-rental/owner/calendar"
      bullets={[
        'Per-boat monthly view',
        'Colors: grey free · yellow held · blue confirmed · green paid · red cancelled',
        'Click a cell → booking detail modal with all broker/client/trip info',
      ]}
    />
  );
}
