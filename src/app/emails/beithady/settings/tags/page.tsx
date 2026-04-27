import { Tag, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyTagsPage() {
  await requireBeithadyPermission('settings', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Tags' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Tags"
        title="Tags"
        subtitle="Guest tags + conversation tags taxonomy."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
          <Tag size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-rose-600" />
          Phase B coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Centralized taxonomy that drives segment building, SLA color coding,
          AI auto-reply gating (VIP / complaint flag a thread off auto-send),
          and Ads custom-audience sync.
        </p>
      </div>
    </BeithadyShell>
  );
}
