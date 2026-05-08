import { Suspense } from 'react';
import { BeithadyShell, BeithadyHeader } from '@/app/beithady/_components/beithady-shell';
import {
  computePriorDate,
  loadSnapshot,
  loadEarliestSnapshotDate,
  loadLatestSnapshotDate,
  loadNearestSnapshot,
} from './_lib/load-snapshot';
import { EmptySnapshot } from './_components/empty-snapshot';
import { DashboardShell } from './_components/dashboard-shell';
import { loadDailyActivityLive } from '@/lib/beithady/daily-activity-live';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';

type SearchParams = Promise<{ date?: string; building?: string; compare?: string }>;

const COMPARE_OPTIONS = ['yesterday', 'last-week', 'last-month', 'last-year', 'none'] as const;
type CompareMode = typeof COMPARE_OPTIONS[number];
function parseCompare(input: string | undefined): CompareMode {
  return COMPARE_OPTIONS.includes(input as CompareMode) ? (input as CompareMode) : 'yesterday';
}

export const metadata = { title: 'Performance Dashboard · Beithady' };

// Server actions invoked from this route inherit its function timeout. The
// `rebuildSnapshotAction` (used by EmptySnapshot's "Rebuild snapshot"
// button) calls `runDailyReport` which can take 60-180s for a fresh build.
// Match the cron route's cap so Vercel doesn't kill the rebuild mid-flight.
export const maxDuration = 180;

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

  // Load the prior snapshot when a compare mode is set and we have an anchor
  // date. Tolerant lookup: if the exact target date has a NULL or malformed
  // payload (a known cron-gap pattern), pick the nearest well-formed neighbor
  // within ±3 days. We surface the actual date used + the offset to the UI.
  const priorTargetDate =
    result.status === 'found' && compareMode !== 'none'
      ? computePriorDate(result.date, compareMode)
      : null;
  const priorResult = priorTargetDate ? await loadNearestSnapshot(priorTargetDate, 3) : null;
  const priorPayload =
    priorResult && priorResult.status === 'found' ? priorResult.payload : null;
  const priorDate = priorResult && priorResult.status === 'found' ? priorResult.date : null;
  const priorOffsetDays =
    priorResult && priorResult.status === 'found' ? priorResult.offsetDays : 0;

  // Hoist live-activity so dxbCounts can be passed as a separate prop.
  const liveActivity =
    result.status === 'found' && result.date === cairoYmd()
      ? await loadDailyActivityLive(result.date)
      : null;

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
            payload={liveActivity ? {
              ...result.payload,
              all: { ...result.payload.all, ...liveActivity.all },
              per_building: {
                'BH-26':  { ...result.payload.per_building['BH-26'],  ...liveActivity.per_building['BH-26']  },
                'BH-73':  { ...result.payload.per_building['BH-73'],  ...liveActivity.per_building['BH-73']  },
                'BH-435': { ...result.payload.per_building['BH-435'], ...liveActivity.per_building['BH-435'] },
                'BH-OK':  { ...result.payload.per_building['BH-OK'],  ...liveActivity.per_building['BH-OK']  },
                OTHER:    { ...result.payload.per_building.OTHER,     ...liveActivity.per_building.OTHER     },
              },
            } : result.payload}
            dxbCounts={liveActivity?.dxb}
            snapshotDate={result.date}
            generatedAt={result.generatedAt}
            initialBuilding={sp.building ?? 'all'}
            initialCompare={compareMode}
            earliestDate={earliestDate}
            latestDate={latestDate}
            priorPayload={priorPayload}
            priorDate={priorDate}
            priorTargetDate={priorTargetDate}
            priorOffsetDays={priorOffsetDays}
          />
        </Suspense>
      )}
    </BeithadyShell>
  );
}
