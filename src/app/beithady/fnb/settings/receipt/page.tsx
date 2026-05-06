import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { SettingsTabs } from '../_components/settings-tabs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ReceiptSettings() {
  await requireBeithadyPermission('fnb', 'read');
  return (
    <>
      <SettingsTabs />
      <div className="ix-card p-6 space-y-3">
        <h2 className="text-lg font-semibold">Receipt settings</h2>
        <p className="text-sm text-slate-500">
          The receipt template (BH brand chrome — navy + cream + coral, Cormorant Garamond + Poppins +
          Cairo for Arabic) is fixed per the visual identity locked in the design spec. Per-building
          customisation today: the VAT registration line printed at the bottom.
        </p>
        <p className="text-sm">
          To set a per-building VAT registration line, go to{' '}
          <Link href="/beithady/fnb/settings/buildings" className="text-rose-600 underline">
            Settings → Buildings
          </Link>{' '}
          and edit each building&rsquo;s &quot;Receipt VAT line&quot; field.
        </p>
      </div>
    </>
  );
}
