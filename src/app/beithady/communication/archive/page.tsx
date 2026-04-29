import Link from 'next/link';
import { Archive, Calendar, ChevronRight } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getArchiveBuckets, getArchiveTotalCount } from '@/lib/beithady/communication/inbox';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ChannelTabs } from '../_components/channel-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Phase R.2 — Archive landing. Year grid with conversation counts.
// Click year → /[year] (month grid). Click month → /[year]/[month]
// (sidebar + thread).

export default async function ArchiveLandingPage() {
  await requireBeithadyPermission('communication', 'read');
  const [{ years }, archiveCount] = await Promise.all([
    getArchiveBuckets(),
    getArchiveTotalCount(),
  ]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Archive' },
    ]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication"
        title="Archive"
        subtitle="Past conversations grouped by year and month. Restore any thread to bring it back into the active inbox."
      />

      <ChannelTabs active="archive" archiveCount={archiveCount} />

      <section className="ix-card p-4 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
        <Archive size={14} />
        <span>
          {archiveCount.toLocaleString()} conversation{archiveCount === 1 ? '' : 's'} archived in total. Active inbox shows only non-archived threads.
        </span>
      </section>

      {years.length === 0 ? (
        <section className="ix-card p-12 text-center text-sm text-slate-500">
          <Calendar size={28} className="mx-auto text-slate-300 mb-3" />
          No archived conversations yet. Conversations get archived automatically after 90 days untouched, or manually from the inbox.
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {years.map(y => (
            <Link
              key={y.year}
              href={`/beithady/communication/archive/${y.year}`}
              className="ix-card p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">{y.year}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {y.count.toLocaleString()} conversation{y.count === 1 ? '' : 's'}
                  </div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-slate-300 group-hover:text-slate-500 transition"
                />
              </div>
            </Link>
          ))}
        </section>
      )}

      <p className="text-[11px] text-slate-500 text-center pt-2">
        <Archive size={11} className="inline mr-1" />
        Click a year to drill into individual months.
      </p>
    </BeithadyShell>
  );
}
