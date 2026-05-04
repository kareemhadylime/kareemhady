import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { SettingsTabs } from '../_components/settings-tabs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CancellationSettings() {
  await requireBeithadyPermission('fnb', 'read');
  return (
    <>
      <SettingsTabs />
      <div className="ix-card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Cancellation grace period</h2>
        <p className="text-sm text-slate-500">
          Each building can have its own grace window (default 120 sec / 2 min, max 5 min) during
          which a guest can self-cancel an order they just submitted.
        </p>
        <p className="text-sm">
          To configure, go to{' '}
          <Link href="/beithady/fnb/settings/buildings" className="text-rose-600 underline">
            Settings → Buildings
          </Link>{' '}
          and edit the &quot;Cancellation grace (sec)&quot; field per building.
        </p>
      </div>
    </>
  );
}
