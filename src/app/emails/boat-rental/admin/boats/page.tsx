import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function BoatsAdmin() {
  return (
    <TabPlaceholder
      title="Boats"
      description="Boat inventory, owner/skipper contacts, capacity, and image gallery."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/boats"
      bullets={[
        'Create / edit / archive boats',
        'Upload up to 10 images per boat (Supabase Storage)',
        'Link to owner record + skipper WhatsApp',
        'Set guest capacity for enforcement at trip detail step',
      ]}
    />
  );
}
