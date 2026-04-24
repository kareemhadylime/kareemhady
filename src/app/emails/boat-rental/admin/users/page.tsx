import { TabPlaceholder } from '../../_components/placeholder';
import { ADMIN_TABS } from '../../_components/tabs';

export default function UsersAdmin() {
  return (
    <TabPlaceholder
      title="Users"
      description="Assign brokers and owners. New users get a temp password to change on first login."
      tabs={ADMIN_TABS}
      currentPath="/emails/boat-rental/admin/users"
      bullets={[
        'Create new app user + grant boat-rental domain access in one action',
        'Assign sub-role: admin / broker / owner',
        'Link owners to their boat_rental_owners record',
        'Users change their temp password at /account/password after first login',
      ]}
    />
  );
}
