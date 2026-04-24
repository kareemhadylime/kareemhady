import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function SeasonsAdmin() {
  return (
    <TabPlaceholder
      title="Seasons & Holidays"
      description="Named date ranges that override the weekday/weekend tier with the season tier price."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/seasons"
      bullets={[
        'Add ranges like "Sham El-Nessim 2026" or "Eid Al-Fitr"',
        'Any booking whose date falls inside a range uses the season tier',
        'Ranges can overlap — any match wins',
      ]}
    />
  );
}
