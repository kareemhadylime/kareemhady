import { Search } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listInbox, loadThread, getInboxStats, getArchiveTotalCount, BOOKING_STATUS_LABELS, type InboxFilter, type BookingStatus } from '@/lib/beithady/communication/inbox';
import { listActiveTemplates, getListingSecrets } from '@/lib/beithady/communication/templates';
import { buildContextFromHeader } from '@/lib/beithady/communication/templates-shared';
import { getPendingSuggestion } from '@/lib/beithady/ai/auto-reply';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';
import { SidebarList } from '../_components/sidebar-list';
import { ThreadPane } from '../_components/thread-pane';
import { MobileFullscreenLayout } from '../_components/mobile-fullscreen-layout';
import { StatLink, buildStatHref, VALID_SORTS, SORT_LABELS } from '../_components/stat-link';
import type { SlaBucket } from '@/lib/beithady/communication/sla';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE_PATH = '/beithady/communication/unified';

type SearchParams = {
  c?: string;
  q?: string;
  sla?: string;
  unread?: string;
  breach?: string;
  bs?: string;          // booking status filter (inquiry|future|in_house|past|cancelled)
  sort?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
  // Phase C.5 — channel switcher
  ch?: string;
  switch_revert?: string;
  switch_hint?: string;
  via?: string;
};

const VALID_BOOKING_STATUSES: ReadonlyArray<BookingStatus> = ['inquiry', 'future', 'in_house', 'past', 'cancelled'];

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = {};
  if (sp.q) f.search = sp.q;
  if (sp.sla === 'red' || sp.sla === 'orange' || sp.sla === 'yellow' || sp.sla === 'green' || sp.sla === 'none') {
    f.slaBucket = sp.sla as SlaBucket;
  }
  if (sp.unread === '1') f.unreadOnly = true;
  if (sp.breach === '1') f.breachOnly = true;
  if (sp.bs && (VALID_BOOKING_STATUSES as readonly string[]).includes(sp.bs)) {
    f.bookingStatus = sp.bs as BookingStatus;
  }
  if (sp.sort && (VALID_SORTS as readonly string[]).includes(sp.sort)) {
    f.sort = sp.sort as typeof VALID_SORTS[number];
  }
  return f;
}

function preserveQuery(sp: SearchParams): string {
  const parts: string[] = [];
  if (sp.q) parts.push(`q=${encodeURIComponent(sp.q)}`);
  if (sp.sla) parts.push(`sla=${encodeURIComponent(sp.sla)}`);
  if (sp.unread === '1') parts.push('unread=1');
  if (sp.breach === '1') parts.push('breach=1');
  if (sp.bs) parts.push(`bs=${encodeURIComponent(sp.bs)}`);
  if (sp.sort) parts.push(`sort=${encodeURIComponent(sp.sort)}`);
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

  const [inbox, stats, thread, pendingSuggestion, archiveCount, templates] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats(),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
    sp.c ? getPendingSuggestion(sp.c) : Promise.resolve(null),
    getArchiveTotalCount(),
    listActiveTemplates(),
  ]);

  // Q.2 — build template context from the loaded thread + listing secrets.
  let templateContext = undefined;
  if (thread) {
    const secrets = await getListingSecrets(thread.header.listing_id);
    templateContext = buildContextFromHeader(
      {
        guest_full_name: thread.header.guest_full_name,
        listing_nickname: thread.header.listing_nickname,
        building_code: thread.header.building_code,
      },
      {
        reservation: thread.reservation,
        secrets,
      },
    );
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Unified' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Unified Inbox"
        subtitle="Every channel in one feed — Guesty + WhatsApp Cloud + WhatsApp Casual. Sorted by SLA breach severity."
      />

      <ChannelTabs active="unified" archiveCount={archiveCount} />

      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <StatLink label="Open" value={stats.open} href={buildStatHref(BASE_PATH, sp, { sla: null, unread: null, breachOnly: null })} active={!sp.sla && sp.unread !== '1' && sp.breach !== '1'} />
        <StatLink label="Unread" value={stats.unread} accent="rose" href={buildStatHref(BASE_PATH, sp, { unread: true })} active={sp.unread === '1'} />
        <StatLink label="🔴 > 12h" value={stats.red} accent="rose" href={buildStatHref(BASE_PATH, sp, { sla: 'red' })} active={sp.sla === 'red'} />
        <StatLink label="🟠 4-12h" value={stats.orange} accent="amber" href={buildStatHref(BASE_PATH, sp, { sla: 'orange' })} active={sp.sla === 'orange'} />
        <StatLink label="🟡 1-4h" value={stats.yellow} accent="yellow" href={buildStatHref(BASE_PATH, sp, { sla: 'yellow' })} active={sp.sla === 'yellow'} />
        <StatLink label="🟢 ≤ 1h" value={stats.green} accent="emerald" href={buildStatHref(BASE_PATH, sp, { sla: 'green' })} active={sp.sla === 'green'} />
        <StatLink label="Breach" value={stats.breach} accent="rose" href={buildStatHref(BASE_PATH, sp, { breachOnly: true })} active={sp.breach === '1'} />
      </section>

      <form className="ix-card p-3 grid grid-cols-2 lg:grid-cols-7 gap-2 text-sm">
        <input name="q" placeholder="Search across all channels…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="bs" defaultValue={sp.bs || ''} className="ix-input" title="Filter by booking status">
          <option value="">Any booking status</option>
          {VALID_BOOKING_STATUSES.map(b => (
            <option key={b} value={b}>{BOOKING_STATUS_LABELS[b]}</option>
          ))}
        </select>
        <select name="sla" defaultValue={sp.sla || ''} className="ix-input">
          <option value="">Any SLA</option>
          <option value="red">🔴 Red &gt; 12h</option>
          <option value="orange">🟠 Orange 4-12h</option>
          <option value="yellow">🟡 Yellow 1-4h</option>
          <option value="green">🟢 Green ≤ 1h</option>
          <option value="none">Replied (no SLA)</option>
        </select>
        <select name="sort" defaultValue={sp.sort || ''} className="ix-input" title="Sort order">
          <option value="">Sort: {SORT_LABELS.recent_inbound}</option>
          {VALID_SORTS.filter(s => s !== 'recent_inbound').map(s => (
            <option key={s} value={s}>Sort: {SORT_LABELS[s]}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === '1'} />
          Unread only
        </label>
        <button type="submit" className="ix-btn-primary text-xs">
          <Search size={12} /> Filter
        </button>
      </form>

      <MobileFullscreenLayout
        selectedId={sp.c}
        basePath="/beithady/communication/unified"
        preservedQuery={preserveQuery(sp)}
        sidebar={
          <>
            <SidebarList
              rows={inbox.rows}
              basePath="/beithady/communication/unified"
              selectedId={sp.c}
              searchQuery={preserveQuery(sp)}
            />
            {inbox.total > inbox.pageSize && (
              <p className="text-[11px] text-slate-500 text-center pt-3">
                Showing {inbox.rows.length} of {inbox.total.toLocaleString()} matching.
              </p>
            )}
          </>
        }
        threadPane={
          <ThreadPane
            // Audit fix C-A1..A10: key on conversation id forces React to
            // unmount the entire ThreadPane subtree when the operator
            // switches conversations. Without it, composer drafts,
            // pending attachments + blob URLs, internal-notes textarea,
            // channel-switcher banner, voice-recorder mic stream, etc.
            // all leaked into the next conversation — typing "hello
            // Alice" then clicking Bob delivered Alice's draft to Bob.
            key={thread?.header.id ?? 'empty'}
            bundle={thread}
            composerHints={{
              send_error: sp.send_error,
              send_status: sp.send_status,
              fallback_url: sp.fallback,
              sent: sp.sent === '1',
              switch_revert: sp.switch_revert,
              switch_hint: sp.switch_hint,
              selected_target: sp.ch as never,
              return_path: BASE_PATH,
            }}
            pendingSuggestion={pendingSuggestion}
            templates={templates}
            templateContext={templateContext}
          />
        }
      />

    </BeithadyShell>
  );
}

