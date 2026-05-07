import { Suspense } from 'react';
import { BeithadyShell, BeithadyHeader } from '@/app/beithady/_components/beithady-shell';
import { computePriorDate, loadSnapshot, loadEarliestSnapshotDate, loadLatestSnapshotDate } from './_lib/load-snapshot';
import { EmptySnapshot } from './_components/empty-snapshot';
import { DashboardShell } from './_components/dashboard-shell';

type SearchParams = Promise<{ date?: string; building?: string; compare?: string }>;

const COMPARE_OPTIONS = ['yesterday', 'last-week', 'last-month', 'last-year', 'none'] as const;
type CompareMode = typeof COMPARE_OPTIONS[number];
function parseCompare(input: string | undefined): CompareMode {
  return COMPARE_OPTIONS.includes(input as CompareMode) ? (input as CompareMode) : 'yesterday';
}

export const metadata = { title: 'Performance Dashboard · Beithady' };

export default async function PerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const compareMode = parseCompare(sp.compare);

  // Resolve the primary snapshot first so we know the actual date the prior
  // comparison should anchor against (`?date=` may be invalid or absent, in
  // which case loadSnapshot falls back to the latest available snapshot).
  const [result, earliestDate, latestDate] = await Promise.all([
    loadSnapshot(sp.date),
    loadEarliestSnapshotDate(),
    loadLatestSnapshotDate(),
  ]);

  // Load the prior snapshot in parallel with rendering decisions when a
  // compare mode is set and we have an anchor date.
  const priorDate =
    result.status === 'found' && compareMode !== 'none'
      ? computePriorDate(result.date, compareMode)
      : null;
  const priorResult = priorDate ? await loadSnapshot(priorDate) : null;
  const priorPayload =
    priorResult && priorResult.status === 'found' ? priorResult.payload : null;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Performance' },
      ]}
      containerClass="max-w-[1900px]"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Performance Dashboard"
        subtitle="Live snapshot of yesterday's performance — occupancy, revenue, pace, AI insights, customizable. Click any panel to drill down."
      />
      {result.status === 'missing' ? (
        <EmptySnapshot date={result.date} />
      ) : (
        <Suspense>
          <DashboardShell
            payload={result.payload}
            snapshotDate={result.date}
            generatedAt={result.generatedAt}
            initialBuilding={sp.building ?? 'all'}
            initialCompare={compareMode}
            earliestDate={earliestDate}
            latestDate={latestDate}
            priorPayload={priorPayload}
            priorDate={priorDate}
          />
        </Suspense>
      )}
    </BeithadyShell>
  );
}
