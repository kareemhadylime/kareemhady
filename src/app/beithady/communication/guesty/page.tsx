import Link from 'next/link';
import { Search, AlertTriangle, Mail } from 'lucide-react';
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

const BASE_PATH = '/beithady/communication/guesty';

type SearchParams = {
  c?: string;
  q?: string;
  source?: string;
  building?: string;
  sla?: string;
  unread?: string;
  breach?: string;
  bs?: string;
  sort?: string;
  send_error?: string;
  send_status?: string;
  fallback?: string;
  sent?: string;
  // Phase C.5
  ch?: string;
  switch_revert?: string;
  switch_hint?: string;
  via?: string;
};

const VALID_BOOKING_STATUSES: ReadonlyArray<BookingStatus> = ['inquiry', 'future', 'in_house', 'past', 'cancelled'];

function parseFilter(sp: SearchParams): InboxFilter {
  const f: InboxFilter = { channel: 'guesty' };
  if (sp.q) f.search = sp.q;
  if (sp.source) f.source = sp.source;
  if (sp.building) f.building = sp.building;
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
  const params: string[] = [];
  if (sp.q) params.push(`q=${encodeURIComponent(sp.q)}`);
  if (sp.source) params.push(`source=${encodeURIComponent(sp.source)}`);
  if (sp.building) params.push(`building=${encodeURIComponent(sp.building)}`);
  if (sp.sla) params.push(`sla=${encodeURIComponent(sp.sla)}`);
  if (sp.unread === '1') params.push('unread=1');
  if (sp.breach === '1') params.push('breach=1');
  if (sp.bs) params.push(`bs=${encodeURIComponent(sp.bs)}`);
  if (sp.sort) params.push(`sort=${encodeURIComponent(sp.sort)}`);
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

  const [inbox, stats, thread, pendingSuggestion, archiveCount, templates] = await Promise.all([
    listInbox({ filter, page: 1, pageSize: 50 }),
    getInboxStats('guesty'),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
    sp.c ? getPendingSuggestion(sp.c) : Promise.resolve(null),
    getArchiveTotalCount('guesty'),
    listActiveTemplates(),
  ]);

  let templateContext = undefined;
  if (thread) {
    const secrets = await getListingSecrets(thread.header.listing_id);
    templateContext = buildContextFromHeader(
      {
        guest_full_name: thread.header.guest_full_name,
        listing_nickname: thread.header.listing_nickname,
        building_code: thread.header.building_code,
      },
      { reservation: thread.reservation, secrets },
    );
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Guesty Inbox' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Guesty Inbox"
        subtitle="Airbnb · Booking.com · Direct · Vrbo. Read mirror live; reply composer ships in Phase C.2."
      />

      <ChannelTabs active="guesty" archiveCount={archiveCount} />

      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <StatLink label="Open" value={stats.open} href={buildStatHref(BASE_PATH, sp, { sla: null, unread: null, breachOnly: null })} active={!sp.sla && sp.unread !== '1' && sp.breach !== '1'} />
        <StatLink label="Unread" value={stats.unread} accent="rose" href={buildStatHref(BASE_PATH, sp, { unread: true })} active={sp.unread === '1'} />
        <StatLink label="🔴 > 12h" value={stats.red} accent="rose" href={buildStatHref(BASE_PATH, sp, { sla: 'red' })} active={sp.sla === 'red'} />
        <StatLink label="🟠 4-12h" value={stats.orange} accent="amber" href={buildStatHref(BASE_PATH, sp, { sla: 'orange' })} active={sp.sla === 'orange'} />
        <StatLink label="🟡 1-4h" value={stats.yellow} accent="yellow" href={buildStatHref(BASE_PATH, sp, { sla: 'yellow' })} active={sp.sla === 'yellow'} />
        <StatLink label="🟢 ≤ 1h" value={stats.green} accent="emerald" href={buildStatHref(BASE_PATH, sp, { sla: 'green' })} active={sp.sla === 'green'} />
        <StatLink label="Breach" value={stats.breach} accent="rose" href={buildStatHref(BASE_PATH, sp, { breachOnly: true })} active={sp.breach === '1'} />
      </section>

      {/* Filter form */}
      <form className="ix-card p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 text-sm">
        <input name="q" placeholder="Search guest, listing…" defaultValue={sp.q || ''} className="ix-input col-span-2" />
        <select name="source" defaultValue={sp.source || ''} className="ix-input">
          <option value="">Any source</option>
          {stats.by_source.map(s => (
            <option key={s.source} value={s.source}>{s.source.replace('2', '')} ({s.count})</option>
          ))}
        </select>
        <input name="building" placeholder="BH-26…" defaultValue={sp.building || ''} className="ix-input" />
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

      <MobileFullscreenLayout
        selectedId={sp.c}
        basePath="/beithady/communication/guesty"
        preservedQuery={preserveQuery(sp)}
        sidebar={
          <>
            <SidebarList
              rows={inbox.rows}
              basePath="/beithady/communication/guesty"
              selectedId={sp.c}
              searchQuery={preserveQuery(sp)}
            />
            {inbox.total > inbox.pageSize && (
              <p className="text-[11px] text-slate-500 text-center pt-3">
                Showing {inbox.rows.length} of {inbox.total.toLocaleString()} matching conversations.
              </p>
            )}
          </>
        }
        threadPane={
          <ThreadPane
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

      <p className="text-[11px] text-slate-500 flex items-center gap-2 justify-center">
        <Mail size={11} /> Read-only mirror · daily sync at 30 5 * * * UTC + 5-min top-up.
        Reply composer + send via Guesty POST endpoint + WhatsApp Cloud/Casual send arrive in Phase C.2.
      </p>
    </BeithadyShell>
  );
}

