import { FileText, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyTemplatesPage() {
  await requireBeithadyPermission('settings', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Templates' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Templates"
        title="Templates"
        subtitle="Reusable message and email scaffolds across every channel."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
          <FileText size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-emerald-600" />
          Phase C / F coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          WABA approved templates with status pings, Guesty saved replies sync,
          per-building pre-arrival checklists, post-checkout CSAT surveys, and
          the upsell catalog (early check-in, late checkout, grocery, photographer).
        </p>
      </div>
    </BeithadyShell>
  );
}
