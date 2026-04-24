import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function NotificationsAdmin() {
  return (
    <TabPlaceholder
      title="Notifications"
      description="WhatsApp delivery log for all boat-rental events."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/notifications"
      bullets={[
        'Every WhatsApp message sent, pending, or failed',
        'Retry failed sends inline',
        'Filter by template · recipient role · status · date',
      ]}
    />
  );
}
