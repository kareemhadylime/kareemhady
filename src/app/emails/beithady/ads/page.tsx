import { Megaphone, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyAdsPage() {
  await requireBeithadyPermission('ads', 'read');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Ads"
        subtitle="Click-to-WhatsApp campaigns across Meta · Google · TikTok. Lead funnel, AI ad copy, attribution."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300">
          <Megaphone size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-yellow-600" />
          Phase H coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Ports the proven VoltAuto Auto Ads Module — Meta Marketing API v21
          CTWA campaigns, carousel from gallery, AI copy in 5 languages,
          country-and-interest targeting per building, and lead-to-booking
          attribution joined back to Guesty reservations.
        </p>
      </div>
    </BeithadyShell>
  );
}
