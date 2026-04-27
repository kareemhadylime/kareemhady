import { Layers, Search } from 'lucide-react';
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
  sla?: string;
  unread?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
};

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = {};
  if (sp.q) f.search = sp.q;
  if (sp.sla === 'red' || sp.sla === 'orange' || sp.sla === 'yellow' || sp.sla === 'green' || sp.sla === 'none') {
    f.slaBucket = sp.sla as SlaBucket;
  }
  if (sp.unread === '1') f.unreadOnly = true;
  return f;
}

function preserveQuery(sp: SearchParams): string {
  const parts: string[] = [];
  if (sp.q) parts.push(`q=${encodeURIComponent(sp.q)}`);
  if (sp.sla) parts.push(`sla=${encodeURIComponent(sp.sla)}`);
  if (sp.unread === '1') parts.push('unread=1');
  return parts.join('&');
}

export default async function UnifiedInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const sp = await searchParams;
  const filter = parseFilter(sp);

  const [inbox, stats, thread] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats(),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/emails/beithady/communication' },
      { label: 'Unified' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Unified Inbox"
        subtitle="Every channel in one feed — Guesty + WhatsApp Cloud + WhatsApp Casual. Sorted by SLA breach severity."
      />

      <ChannelTabs active="unified" />

      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <Stat label="Open" value={stats.open} />
        <Stat label="Unread" value={stats.unread} accent="rose" />
        <Stat label="🔴 > 12h" value={stats.red} accent="rose" />
        <Stat label="🟠 4-12h" value={stats.orange} accent="amber" />
        <Stat label="🟡 1-4h" value={stats.yellow} accent="yellow" />
        <Stat label="🟢 ≤ 1h" value={stats.green} accent="emerald" />
        <Stat label="Breach" value={stats.breach} accent="rose" />
      </section>

      <form className="ix-card p-3 grid grid-cols-2 lg:grid-cols-5 gap-2 text-sm">
        <input name="q" placeholder="Search across all channels…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="sla" defaultValue={sp.sla || ''} className="ix-input">
          <option value="">Any SLA</option>
          <option value="red">🔴 Red &gt; 12h</option>
          <option value="orange">🟠 Orange 4-12h</option>
          <option value="yellow">🟡 Yellow 1-4h</option>
          <option value="green">🟢 Green ≤ 1h</option>
          <option value="none">Replied (no SLA)</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
          Unread only
        </label>
        <button type="submit" className="ix-btn-primary text-xs">
          <Search size={12} /> Filter
        </button>
      </form>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[640px]">
        <div className="overflow-y-auto">
          <SidebarList
            rows={inbox.rows}
            basePath="/emails/beithady/communication/unified"
            selectedId={sp.c}
            searchQuery={preserveQuery(sp)}
          />
          {inbox.total > inbox.pageSize && (
            <p className="text-[11px] text-slate-500 text-center pt-3">
              Showing {inbox.rows.length} of {inbox.total.toLocaleString()} matching.
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
        <Layers size={11} /> Cross-channel search · sorted by SLA breach desc → age desc → modified desc.
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
