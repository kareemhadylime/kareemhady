import { TrendingUp, BedDouble, Star, MessageCircleQuestion, LifeBuoy, Globe2, CalendarRange, MessageSquareReply, FileBarChart, Target } from 'lucide-react';
import Link from 'next/link';
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
      href: '/beithady/pricing',
      title: 'Pricing Intelligence',
      description: 'ADR + STLY YoY · Revenue past-30 · Occupancy next 7/30/60 vs market · per-building drilldown.',
      icon: TrendingUp,
      accent: 'emerald',
      badge: { label: 'PriceLabs', tone: 'navy' },
    },
    {
      href: '/beithady/analytics/market-intel',
      title: 'Market Intelligence',
      description: 'Top source markets vs Egypt national mix · AI persona briefs per under-indexed country.',
      icon: Globe2,
      accent: 'violet',
      badge: { label: 'Live', tone: 'navy' },
    },
    {
      href: '/beithady/analytics/calendar-heatmap',
      title: 'Calendar Heatmap',
      description: '90-day occupancy grid per building. Click any gap to spawn a targeted Meta CTWA campaign.',
      icon: CalendarRange,
      accent: 'amber',
      badge: { label: 'Live', tone: 'navy' },
    },
    {
      href: '/beithady/analytics/reviews',
      title: 'Reviews',
      description: 'AI-drafted multi-language replies to Guesty/OTA reviews. Edit, approve, send back via Guesty.',
      icon: MessageSquareReply,
      accent: 'rose',
      badge: { label: 'AI', tone: 'gold' },
    },
    {
      href: '/beithady/analytics/reports',
      title: 'Generate Report',
      description: 'Build custom dashboards · pivot tables · BCG matrix · A4 PDF · scheduled email + WhatsApp delivery.',
      icon: FileBarChart,
      accent: 'indigo',
      badge: { label: 'New', tone: 'gold' },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <Link
          href="/beithady/analytics/performance"
          className="group relative overflow-hidden rounded-xl border border-[#003462]/10 bg-white p-6 transition hover:border-[#003462]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
        >
          <div className="absolute right-5 top-5 text-[#003462]/30 transition group-hover:translate-x-0.5 group-hover:text-[#003462]" aria-hidden="true">→</div>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[#eae9f3] text-[#003462]">
            <Target className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-[#003462]">Performance Dashboard</h3>
            <span className="rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Live</span>
          </div>
          <p className="mt-1 text-sm text-[#6077a6]">Today · MTD · pace · drill-down. Daily report data, clickable.</p>
        </Link>
      </div>

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
