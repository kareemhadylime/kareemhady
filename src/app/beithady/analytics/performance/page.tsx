import { Suspense } from 'react';
import { BeithadyShell, BeithadyHeader } from '@/app/beithady/_components/beithady-shell';
import { loadSnapshot, loadEarliestSnapshotDate } from './_lib/load-snapshot';
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
  const [result, earliestDate] = await Promise.all([
    loadSnapshot(sp.date),
    loadEarliestSnapshotDate(),
  ]);

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
            initialCompare={parseCompare(sp.compare)}
            earliestDate={earliestDate}
          />
        </Suspense>
      )}
    </BeithadyShell>
  );
}
