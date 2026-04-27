import { TrendingUp, BedDouble, Star, MessageCircleQuestion, LifeBuoy, Globe2, CalendarRange } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';
import { BeithadyRuleCards } from '../_components/rule-cards';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BeithadyAnalyticsPage() {
  await requireBeithadyPermission('analytics', 'read');

  const tiles: LauncherTile[] = [
    {
      href: '/emails/beithady/pricing',
      title: 'Pricing Intelligence',
      description: 'ADR + STLY YoY · Revenue past-30 · Occupancy next 7/30/60 vs market · per-building drilldown.',
      icon: TrendingUp,
      accent: 'emerald',
      badge: { label: 'PriceLabs', tone: 'navy' },
    },
    {
      href: '#',
      title: 'Market Intelligence',
      description: 'Top source markets vs Egypt national mix · AI persona briefs per under-indexed country.',
      icon: Globe2,
      accent: 'violet',
      disabled: true,
      comingSoonLabel: 'Phase G',
    },
    {
      href: '#',
      title: 'Calendar Heatmap',
      description: '90-day occupancy grid per building. Click any gap to spawn a targeted Meta CTWA campaign.',
      icon: CalendarRange,
      accent: 'amber',
      disabled: true,
      comingSoonLabel: 'Phase G',
    },
  ];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Analytics' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Analytics"
        subtitle="Pricing, demand, market intelligence, and the Gmail-rule aggregates that feed the morning report."
      />

      <BeithadyLauncher tiles={tiles} columns={3} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BedDouble size={16} className="text-rose-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Bookings
          </h2>
        </div>
        <BeithadyRuleCards
          actionTypes={['beithady_booking_aggregate']}
          emptyMessage="No booking-aggregate rules under Beithady yet."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-amber-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Reviews
          </h2>
        </div>
        <BeithadyRuleCards
          actionTypes={['beithady_reviews_aggregate']}
          emptyMessage="No review-aggregate rules under Beithady yet."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion size={16} className="text-sky-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Inquiries
          </h2>
        </div>
        <BeithadyRuleCards
          actionTypes={['beithady_inquiries_aggregate']}
          emptyMessage="No inquiry-aggregate rules under Beithady yet."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <LifeBuoy size={16} className="text-orange-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Guest requests
          </h2>
        </div>
        <BeithadyRuleCards
          actionTypes={['beithady_requests_aggregate']}
          emptyMessage="No request-aggregate rules under Beithady yet."
        />
      </section>
    </BeithadyShell>
  );
}
