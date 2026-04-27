import { ListPlus, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyCustomFieldsPage() {
  await requireBeithadyPermission('settings', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Custom fields' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Custom fields"
        title="Custom fields"
        subtitle="Extend the guest profile with arbitrary fields."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
          <ListPlus size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-indigo-600" />
          Phase B coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Define your own fields on the guest profile — anniversary, dietary,
          accessibility, partner names, language preference. Backed by
          <code className="mx-1">beithady_guests.custom_fields jsonb</code>.
        </p>
      </div>
    </BeithadyShell>
  );
}
