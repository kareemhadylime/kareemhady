import { Calendar, Calculator, Banknote } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';
import { BeithadyRuleCards } from '../_components/rule-cards';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BeithadyFinancialPage() {
  await requireBeithadyPermission('financial', 'read');

  const tiles: LauncherTile[] = [
    {
      href: '/emails/beithady/setup',
      title: 'Daily Performance Report',
      description: 'A4 PDF dashboard · Today + MTD per BH-26/73/435/OK · payouts · reviews · pricing alerts. Manage recipients in Setup.',
      icon: Calendar,
      accent: 'cyan',
      badge: { label: '09:00 Cairo', tone: 'navy' },
    },
    {
      href: '/emails/beithady/financials',
      title: 'Financials',
      description: 'Consolidated P&L (Egypt + Dubai) · Vendors / Employee / Owners Payables · building + LOB filters.',
      icon: Calculator,
      accent: 'rose',
      badge: { label: 'Odoo', tone: 'navy' },
    },
  ];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Financial' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Financial"
        title="Financial"
        subtitle="Daily performance, P&L, payouts, and payables — across Egypt and Dubai entities."
      />

      <BeithadyLauncher tiles={tiles} columns={2} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Banknote size={16} className="text-emerald-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Payout aggregates (Gmail rules)
          </h2>
        </div>
        <BeithadyRuleCards
          actionTypes={['beithady_payout_aggregate']}
          emptyMessage="No payout-aggregate rules under Beithady yet."
        />
      </section>
    </BeithadyShell>
  );
}
