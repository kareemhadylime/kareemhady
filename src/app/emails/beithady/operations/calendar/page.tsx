import { CalendarRange } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function CalendarPlaceholder() {
  await requireBeithadyPermission('operations', 'read');
  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/emails/beithady/operations' },
      { label: 'Multi-Calendar' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Multi-Calendar"
        subtitle="Reservations across all bookable units."
      />
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        <CalendarRange size={28} className="mx-auto mb-3 text-slate-300" />
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Calendar grid lands in J.3</h3>
        <p className="text-[12px] max-w-md mx-auto">
          The Operations Calendar foundation (Phase J.1) is in place. The interactive
          grid + reservation drawer ship in the next sub-phases.
        </p>
      </div>
    </BeithadyShell>
  );
}
