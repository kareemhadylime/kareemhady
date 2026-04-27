import { ListChecks, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyCrmTasksPage() {
  await requireBeithadyPermission('crm', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/emails/beithady/crm' },
      { label: 'Tasks' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Tasks"
        title="Tasks"
        subtitle="Pre-arrival reminders · mid-stay outreach · post-stay review asks · CSAT follow-ups · ad-hoc to-dos."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
          <ListChecks size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-amber-600" />
          Phase F coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Backed by <code className="text-xs">beithady_tasks</code> (introduced in Phase F).
          System-generated triggers wire up here: 24h pre-arrival check-in instructions,
          mid-stay outreach, post-checkout review ask, 30-day re-engagement, 90-day win-back.
          Manual tasks can also be assigned to specific Beithady team members.
        </p>
      </div>
    </BeithadyShell>
  );
}
