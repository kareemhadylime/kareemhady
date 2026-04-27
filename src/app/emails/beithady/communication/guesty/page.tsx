import Link from 'next/link';
import { Search, AlertTriangle, Mail } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listInbox, loadThread, getInboxStats, type InboxFilter } from '@/lib/beithady/communication/inbox';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';
import { SidebarList } from '../_components/sidebar-list';
import { ThreadPane } from '../_components/thread-pane';
import type { SlaBucket } from '@/lib/beithady/communication/sla';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SearchParams = {
  c?: string;
  q?: string;
  source?: string;
  building?: string;
  sla?: string;
  unread?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
};

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = { channel: 'guesty' };
  if (sp.q) f.search = sp.q;
  if (sp.source) f.source = sp.source;
  if (sp.building) f.building = sp.building;
  if (sp.sla === 'red' || sp.sla === 'orange' || sp.sla === 'yellow' || sp.sla === 'green' || sp.sla === 'none') {
    f.slaBucket = sp.sla as SlaBucket;
  }
  if (sp.unread === '1') f.unreadOnly = true;
  return f;
}

function preserveQuery(sp: SearchParams): string {
  const params: string[] = [];
  if (sp.q) params.push(`q=${encodeURIComponent(sp.q)}`);
  if (sp.source) params.push(`source=${encodeURIComponent(sp.source)}`);
  if (sp.building) params.push(`building=${encodeURIComponent(sp.building)}`);
  if (sp.sla) params.push(`sla=${encodeURIComponent(sp.sla)}`);
  if (sp.unread === '1') params.push('unread=1');
  return params.join('&');
}

export default async function GuestyInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const sp = await searchParams;
  const filter = parseFilter(sp);

  const [inbox, stats, thread] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats('guesty'),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/emails/beithady/communication' },
      { label: 'Guesty Inbox' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Guesty Inbox"
        subtitle="Airbnb · Booking.com · Direct · Vrbo. Read mirror live; reply composer ships in Phase C.2."
      />

      <ChannelTabs active="guesty" />

      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat label="Open" value={stats.open} />
        <Stat label="Unread" value={stats.unread} accent="rose" />
        <Stat label="🔴 > 12h" value={stats.red} accent="rose" />
        <Stat label="🟠 4-12h" value={stats.orange} accent="amber" />
        <Stat label="🟡 1-4h" value={stats.yellow} accent="yellow" />
        <Stat label="🟢 ≤ 1h" value={stats.green} accent="emerald" />
        <Stat label="Breach" value={stats.breach} accent="rose" />
      </section>

      {/* Filter form */}
      <form className="ix-card p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
        <input name="q" placeholder="Search guest, listing…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="source" defaultValue={sp.source || ''} className="ix-input">
          <option value="">Any source</option>
          {stats.by_source.map(s => (
            <option key={s.source} value={s.source}>{s.source.replace('2', '')} ({s.count})</option>
          ))}
        </select>
        <input name="building" placeholder="BH-26…" defaultValue={sp.building || ''} className="ix-input" />
        <select name="sla" defaultValue={sp.sla || ''} className="ix-input">
          <option value="">Any SLA</option>
          <option value="red">🔴 Red &gt; 12h</option>
          <option value="orange">🟠 Orange 4-12h</option>
          <option value="yellow">🟡 Yellow 1-4h</option>
          <option value="green">🟢 Green ≤ 1h</option>
          <option value="none">Replied (no SLA)</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
            Unread
          </label>
          <button type="submit" className="ix-btn-primary text-xs flex-1">
            <Search size={12} /> Filter
          </button>
        </div>
      </form>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[640px]">
        <div className="overflow-y-auto">
          <SidebarList
            rows={inbox.rows}
            basePath="/emails/beithady/communication/guesty"
            selectedId={sp.c}
            searchQuery={preserveQuery(sp)}
          />
          {inbox.total > inbox.pageSize && (
            <p className="text-[11px] text-slate-500 text-center pt-3">
              Showing {inbox.rows.length} of {inbox.total.toLocaleString()} matching conversations.
              Pagination wires in C.2.
            </p>
          )}
        </div>
        <div className="lg:h-[640px]">
          <ThreadPane
            bundle={thread}
            composerHints={{
              send_error: sp.send_error,
              send_status: sp.send_status,
              fallback_url: sp.fallback,
              sent: sp.sent === '1',
            }}
          />
        </div>
      </section>

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Mail size={11} /> Read-only mirror · daily sync at 30 5 * * * UTC + 5-min top-up.
        Reply composer + send via Guesty POST endpoint + WhatsApp Cloud/Casual send arrive in Phase C.2.
      </p>
    </BeithadyShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'rose' | 'amber' | 'yellow' | 'emerald' }) {
  const cls = accent === 'rose'
    ? 'text-rose-700 dark:text-rose-300'
    : accent === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : accent === 'yellow'
        ? 'text-yellow-700 dark:text-yellow-300'
        : accent === 'emerald'
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}
