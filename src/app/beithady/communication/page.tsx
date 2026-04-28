import Link from 'next/link';
import { Inbox, MessageSquare, Phone, Layers, ListChecks, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getSetting } from '@/lib/beithady/settings';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';

export const dynamic = 'force-dynamic';

// Communication landing — replaces the redirect with a real overview
// that surfaces the outbound kill-switch state, links to the four
// inbox channels, and points to the templates approval workflow.

export default async function BeithadyCommunicationLanding() {
  await requireBeithadyPermission('communication', 'read');
  const [paused, pausedReason] = await Promise.all([
    getSetting<boolean>('beithady_outbound_paused', false),
    getSetting<string>('beithady_outbound_paused_reason', ''),
  ]);

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Communication' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Communication"
        subtitle="Inboxes, outbound delivery log, kill switches, and template approval — all guest-facing messaging surfaces."
      />

      {paused && (
        <div className="ix-card p-4 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 flex items-start gap-3">
          <ShieldAlert size={22} className="text-rose-600 dark:text-rose-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-200">All outbound communication is PAUSED</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              {pausedReason || 'Manual pause engaged.'}
            </p>
            <Link href="/beithady/settings/templates" className="ix-link text-xs font-semibold">
              Open Templates &amp; kill-switch panel →
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-300">Inbox / message log</h2>
        <p className="text-xs text-slate-500 dark:text-slate-300 max-w-2xl">
          Every inbound + outbound message is recorded in <code>beithady_messages</code>. These four views are the canonical message log — searchable per channel.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ChannelCard
            href="/beithady/communication/guesty"
            icon={<Inbox size={20} />}
            title="Guesty Inbox"
            subtitle="Airbnb / Booking / Hopper / Direct"
            tone="navy"
          />
          <ChannelCard
            href="/beithady/communication/wa-casual"
            icon={<MessageSquare size={20} />}
            title="WhatsApp Casual"
            subtitle="Green-API direct line · two-way"
            tone="emerald"
          />
          <ChannelCard
            href="/beithady/communication/wa-cloud"
            icon={<Phone size={20} />}
            title="WhatsApp Cloud (WABA)"
            subtitle="Approved-template only · pending"
            tone="cyan"
          />
          <ChannelCard
            href="/beithady/communication/unified"
            icon={<Layers size={20} />}
            title="Unified inbox"
            subtitle="All channels merged"
            tone="violet"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-300">Controls</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChannelCard
            href="/beithady/settings/templates"
            icon={<ListChecks size={20} />}
            title="Templates &amp; kill switch"
            subtitle="Review · approve · enable per template body. Pause/Resume all outbound from one button."
            tone="amber"
          />
          <ChannelCard
            href="/beithady/settings/ai-config"
            icon={<SettingsIcon size={20} />}
            title="AI auto-reply config"
            subtitle="Confidence threshold · global on/off · VIP digest"
            tone="rose"
          />
        </div>
      </section>
    </BeithadyShell>
  );
}

const TONE_BG: Record<string, string> = {
  navy: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-200',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-200',
  cyan: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-200',
  violet: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-200',
  amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-200',
  rose: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200',
};

function ChannelCard({
  href, icon, title, subtitle, tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone: string;
}) {
  return (
    <Link href={href} className="ix-card p-4 hover:shadow-md transition flex items-start gap-3 group">
      <div className={`shrink-0 w-10 h-10 rounded-lg inline-flex items-center justify-center ${TONE_BG[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold group-hover:underline" style={{ color: 'var(--bh-heading)' }}>
          {title}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-300">{subtitle}</p>
      </div>
    </Link>
  );
}
