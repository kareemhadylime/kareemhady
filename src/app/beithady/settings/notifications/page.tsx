import { BeithadyShell, BeithadyHeader } from '@/app/beithady/_components/beithady-shell';
import { loadWaNotificationSettings } from '@/lib/beithady/wa-reservation-notify';
import { NotificationsClient } from './_client';

export const metadata = { title: 'Reservation Notifications · Beithady Settings' };

export default async function NotificationsPage() {
  const settings = await loadWaNotificationSettings();
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Settings', href: '/beithady/settings' },
        { label: 'Notifications' },
      ]}
    >
      <BeithadyHeader
        eyebrow="Settings · Notifications"
        title="Reservation Notifications"
        subtitle="Send a WhatsApp message to your team the moment a new reservation is confirmed in Guesty."
      />
      <NotificationsClient initialSettings={settings} />
    </BeithadyShell>
  );
}
