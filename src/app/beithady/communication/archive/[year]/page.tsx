import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, ChevronLeft, ChevronRight, Archive } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getArchiveBuckets, getArchiveTotalCount } from '@/lib/beithady/communication/inbox';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { ChannelTabs } from '../../_components/channel-tabs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Phase R.2 — Year detail page. Lists every month inside the year that
// has at least one archived conversation.

export default async function ArchiveYearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  await requireBeithadyPermission('communication', 'read');
  const { year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!year || year < 2000 || year > 2100) notFound();

  const [{ months }, archiveCount] = await Promise.all([
    getArchiveBuckets(),
    getArchiveTotalCount(),
  ]);
  const monthsForYear = months.filter(m => m.year === year);
  if (monthsForYear.length === 0) notFound();

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Archive', href: '/beithady/communication/archive' },
      { label: String(year) },
    ]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Communication · Archive`}
        title={String(year)}
        subtitle={`${monthsForYear.reduce((s, m) => s + m.count, 0).toLocaleString()} conversations archived from ${year}.`}
      />

      <ChannelTabs active="archive" archiveCount={archiveCount} />

      <Link
        href="/beithady/communication/archive"
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ChevronLeft size={12} />
        All years
      </Link>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {monthsForYear.map(m => (
          <Link
            key={`${m.year}-${m.month}`}
            href={`/beithady/communication/archive/${m.year}/${m.month}`}
            className="ix-card p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-slate-800 dark:text-slate-200">{MONTH_NAMES[m.month - 1]}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {m.count.toLocaleString()} conv{m.count === 1 ? '' : 's'}
                </div>
              </div>
              <ChevronRight
                size={14}
                className="text-slate-300 group-hover:text-slate-500 transition"
              />
            </div>
          </Link>
        ))}
      </section>

      <p className="text-[11px] text-slate-500 text-center pt-2">
        <Calendar size={11} className="inline mr-1" />
        Months with no archived conversations are hidden.
        <span className="mx-2">·</span>
        <Archive size={11} className="inline mr-1" />
        Click a month to read its threads.
      </p>
    </BeithadyShell>
  );
}
