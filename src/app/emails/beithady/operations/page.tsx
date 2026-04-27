import Link from 'next/link';
import { CalendarRange, ClipboardList, Ticket, ChevronRight } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type AnomalySnapshot = {
  unpaid_count: number;
  unpaid_balance_cents: number | null;
  prearrival_missing_count: number;
  cleaning_gap_count: number;
};

async function getAnomalySnapshot(): Promise<AnomalySnapshot> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_calendar_anomalies_v').select('*').maybeSingle();
  return (data as AnomalySnapshot | null) || {
    unpaid_count: 0,
    unpaid_balance_cents: 0,
    prearrival_missing_count: 0,
    cleaning_gap_count: 0,
  };
}

export default async function OperationsLanding() {
  await requireBeithadyPermission('operations', 'read');
  const snap = await getAnomalySnapshot();

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Operations' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="Operations"
        subtitle="Multi-calendar reservations, daily tasks, boarding passes, and manual blocks — all in one cockpit."
      />

      {/* Anomaly snapshot strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <SnapStat
          label="Unpaid (next 7d)"
          value={String(snap.unpaid_count)}
          tone={snap.unpaid_count > 0 ? 'red' : 'neutral'}
        />
        <SnapStat
          label="Unpaid balance"
          value={snap.unpaid_balance_cents
            ? `$${(snap.unpaid_balance_cents / 100).toLocaleString()}`
            : '—'}
          tone={snap.unpaid_balance_cents && snap.unpaid_balance_cents > 0 ? 'red' : 'neutral'}
        />
        <SnapStat
          label="Pre-arrival pending"
          value={String(snap.prearrival_missing_count)}
          tone={snap.prearrival_missing_count > 0 ? 'amber' : 'neutral'}
        />
        <SnapStat
          label="Cleaning gaps"
          value={String(snap.cleaning_gap_count)}
          tone={snap.cleaning_gap_count > 0 ? 'amber' : 'neutral'}
        />
      </section>

      {/* Operations cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <OpCard
          href="/emails/beithady/operations/calendar"
          icon={CalendarRange}
          title="Multi-Calendar"
          description="Reservations across all bookable units. Click any bar for full details, payment status, and channel info."
          badge={{ label: 'Live', tone: 'navy' }}
          accent="cyan"
        />
        <OpCard
          href="/emails/beithady/crm/tasks"
          icon={ClipboardList}
          title="Tasks"
          description="Cleaning, maintenance, and upsell tasks tied to reservations. Phase F."
          badge={{ label: 'Phase F', tone: 'gold' }}
          accent="amber"
        />
        <OpCard
          href="/emails/beithady/operations/boarding-passes"
          icon={Ticket}
          title="Boarding Passes"
          description="Pre-arrival message log + boarding pass URLs + view counts. Phase F."
          badge={{ label: 'Phase F', tone: 'gold' }}
          accent="violet"
        />
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Operations · Phase J
      </footer>
    </BeithadyShell>
  );
}

function SnapStat({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'red' | 'amber' | 'neutral';
}) {
  const cls = tone === 'red'
    ? 'text-rose-700 dark:text-rose-300'
    : tone === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function OpCard({
  href, icon: Icon, title, description, badge, accent,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  badge?: { label: string; tone: 'navy' | 'gold' };
  accent: 'cyan' | 'amber' | 'violet';
}) {
  const accentBg = accent === 'cyan'
    ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-200'
    : accent === 'amber'
      ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200'
      : 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-200';
  const badgeBg = badge?.tone === 'navy'
    ? 'bg-[var(--bh-navy)] text-white'
    : 'bg-[var(--bh-gold)] text-[var(--bh-navy)]';
  return (
    <Link href={href} className="ix-card p-4 group hover:shadow-md hover:-translate-y-0.5 transition flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${accentBg}`}>
          <Icon size={18} />
        </span>
        {badge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeBg}`}>
            {badge.label}
          </span>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--bh-navy)' }}>
          {title}
          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition" />
        </h3>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{description}</p>
      </div>
    </Link>
  );
}
