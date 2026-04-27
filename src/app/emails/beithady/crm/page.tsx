import { Users, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyCrmPage() {
  await requireBeithadyPermission('crm', 'read');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'CRM' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM"
        title="CRM"
        subtitle="Hospitality-tuned guest 360°, segments, loyalty tiers, and the lead pipeline."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
          <Users size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-amber-600" />
          Phase B coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          The CRM module ships next: full Guesty guest mirror, 360° profile,
          smart widgets, segments, loyalty tiers, tasks, and bulk actions —
          modeled on 8worx CRM and tuned to short-term-rental hospitality.
        </p>
        <ul className="text-xs text-slate-500 max-w-md mx-auto text-left list-disc pl-5 space-y-1">
          <li>Guest list with country flag, lifetime stays, tier badge</li>
          <li>360° profile: bookings · communications · reviews · notes · tasks</li>
          <li>Smart dashboard widgets · returning %, top countries, open tasks</li>
          <li>Visual lead pipeline (Phase I)</li>
          <li>Loyalty Bronze → Platinum auto-promotion (Phase F)</li>
        </ul>
      </div>
    </BeithadyShell>
  );
}
