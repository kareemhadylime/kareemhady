import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Archive, Search } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  listInbox,
  loadThread,
  getArchiveTotalCount,
} from '@/lib/beithady/communication/inbox';
import { BeithadyShell, BeithadyHeader } from '../../../../_components/beithady-shell';
import { ChannelTabs } from '../../../_components/channel-tabs';
import { SidebarList } from '../../../_components/sidebar-list';
import { ThreadPane } from '../../../_components/thread-pane';
import { MobileFullscreenLayout } from '../../../_components/mobile-fullscreen-layout';
import { BulkRestoreBar } from '../../_components/bulk-restore-bar';
import { ArchiveMonthHeaderActions } from '../../_components/archive-month-actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type SearchParams = {
  c?: string;
  q?: string;
};

// Phase R.2 — Archive month detail page. Sidebar + thread layout
// scoped to one calendar month of archived conversations. Restore +
// bulk-restore actions live here.

export default async function ArchiveMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; month: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const { year: yearStr, month: monthStr } = await params;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const sp = await searchParams;
  if (!year || !month || month < 1 || month > 12) notFound();

  const [inbox, thread, archiveCount] = await Promise.all([
    listInbox({
      filter: {
        archiveScope: 'archived_in_month',
        archiveYear: year,
        archiveMonth: month,
        search: sp.q || undefined,
        state: 'all',
      },
      page: 1,
      pageSize: 100,
    }),
    sp.c ? loadThread(sp.c) : Promise.resolve(null),
    getArchiveTotalCount(),
  ]);

  const basePath = `/beithady/communication/archive/${year}/${month}`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Archive', href: '/beithady/communication/archive' },
      { label: String(year), href: `/beithady/communication/archive/${year}` },
      { label: MONTH_NAMES[month - 1] },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Communication · Archive · ${year}`}
        title={`${MONTH_NAMES[month - 1]} ${year}`}
        subtitle={`${inbox.total.toLocaleString()} archived conversation${inbox.total === 1 ? '' : 's'} in this month.`}
      />

      <ChannelTabs active="archive" archiveCount={archiveCount} />

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/beithady/communication/archive/${year}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ChevronLeft size={12} />
          {year}
        </Link>
        <ArchiveMonthHeaderActions year={year} month={month} count={inbox.total} />
      </div>

      {/* R.5 archive search within month — filter input */}
      <form className="ix-card p-3 grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
        <input
          name="q"
          placeholder="Search this month — name, email, phone, listing…"
          defaultValue={sp.q || ''}
          className="ix-input md:col-span-5"
        />
        <button type="submit" className="ix-btn-primary text-xs">
          <Search size={12} /> Filter
        </button>
      </form>

      <MobileFullscreenLayout
        selectedId={sp.c}
        basePath={basePath}
        preservedQuery={sp.q ? `q=${encodeURIComponent(sp.q)}` : ''}
        sidebar={
          <div className="space-y-3">
            {inbox.rows.length > 0 && (
              <BulkRestoreBar conversationIds={inbox.rows.map(r => r.id)} basePath={basePath} />
            )}
            <SidebarList
              rows={inbox.rows}
              basePath={basePath}
              selectedId={sp.c}
              searchQuery={sp.q ? `q=${encodeURIComponent(sp.q)}` : ''}
            />
            {inbox.rows.length === 0 && (
              <p className="text-xs text-slate-500 text-center pt-3">
                <Archive size={11} className="inline mr-1" />
                {sp.q
                  ? 'No archived conversations match your search in this month.'
                  : 'No archived conversations in this month.'}
              </p>
            )}
          </div>
        }
        // Audit fix C-A1..A10: see unified/page.tsx for full rationale.
        threadPane={<ThreadPane key={thread?.header.id ?? 'empty'} bundle={thread} />}
      />
    </BeithadyShell>
  );
}
