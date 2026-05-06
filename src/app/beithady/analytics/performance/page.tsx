import { Suspense } from 'react';
import { BeithadyShell } from '@/app/beithady/_components/beithady-shell';
import { loadSnapshot } from './_lib/load-snapshot';
import { EmptySnapshot } from './_components/empty-snapshot';
import { DashboardShell } from './_components/dashboard-shell';

type SearchParams = Promise<{ date?: string; building?: string; compare?: string }>;

export const metadata = { title: 'Performance Dashboard · Beithady' };

export default async function PerformancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const result = await loadSnapshot(sp.date);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Performance' },
      ]}
    >
      {result.status === 'missing' ? (
        <EmptySnapshot date={result.date} />
      ) : (
        <Suspense>
          <DashboardShell
            payload={result.payload}
            snapshotDate={result.date}
            generatedAt={result.generatedAt}
            initialBuilding={sp.building ?? 'all'}
            initialCompare={(sp.compare as 'yesterday' | 'last-week' | 'last-month' | 'last-year' | 'none') ?? 'yesterday'}
          />
        </Suspense>
      )}
    </BeithadyShell>
  );
}
