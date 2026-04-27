import { Globe2, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyMarketIntelPage() {
  await requireBeithadyPermission('crm', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/emails/beithady/crm' },
      { label: 'Market intelligence' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Market intel"
        title="Market intelligence"
        subtitle="Inbound vs outbound source-market analysis · AI persona briefs per under-indexed country."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
          <Globe2 size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          Phase G coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Monthly fetch from CAPMAS (Egypt national tourism stats) + UN Tourism + Google Trends.
          Compares Egypt national source-market mix vs. Beithady's actual mix to surface
          under-indexed countries — feeds the Ads module's geo-targeting in Phase H.
        </p>
      </div>
    </BeithadyShell>
  );
}
