import 'server-only';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { SettingsTabs } from '../_components/settings-tabs';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettings() {
  const { roles, user } = await requireBeithadyPermission('fnb', 'full');
  // Admin-only sub-tab per spec §10.4 — outbound message templates affect production messaging.
  if (!roles.includes('admin') && !user.is_admin) {
    notFound();
  }
  return (
    <>
      <SettingsTabs />
      <div className="ix-card p-6">
        <h2 className="text-lg font-semibold mb-2">Notification templates</h2>
        <p className="text-sm text-slate-500">
          Per-building message template overrides + WA Cloud / Casual preference will live here.
        </p>
        <p className="text-xs text-slate-400 mt-4">
          v1: defaults from <code>src/lib/beithady/fnb/wa-notifier.ts</code> are used for every building.
          Per-building overrides via the <code>message_template_overrides</code> JSON column will ship in
          a follow-on phase. The Buildings sub-tab can already configure recipient phone numbers per
          building.
        </p>
      </div>
    </>
  );
}
