// src/app/beithady/analytics/pace/page.tsx
import { Suspense } from 'react';
import { BeithadyShell } from '@/app/beithady/_components/beithady-shell';
import { cairoYmd } from '@/lib/beithady-daily-report/cairo-dates';
import { parsePeriod, shiftPriorYear } from '@/lib/pace-report/date-ranges';
import { loadPaceListings } from '@/lib/pace-report/load-listings';
import { loadPaceReservations } from '@/lib/pace-report/load-reservations';
import { aggregatePaceReport } from '@/lib/pace-report/aggregate';
import { parsePaceSearchParams } from './_hooks/use-pace-url-state';
import { PaceShell } from './_components/pace-shell';

export const metadata = { title: 'Pace Report · Beithady' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PacePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const urlState = parsePaceSearchParams(sp);
  const today = cairoYmd();
  const range = parsePeriod(urlState.period, today);
  const priorRange = shiftPriorYear(range);

  const listings = await loadPaceListings(urlState.filters);
  const listingIds = listings.map((l) => l.id);

  const [resCurrent, resPrior] = await Promise.all([
    loadPaceReservations(range, listingIds),
    loadPaceReservations(priorRange, listingIds),
  ]);

  const payload = aggregatePaceReport({
    range, priorRange,
    listings,
    reservationsCurrent: resCurrent,
    reservationsPrior: resPrior,
    includeHistorical: urlState.filters.includeHistorical,
  });
  // Carry the filter values forward so the rail can render selected chips.
  payload.filters_applied = { ...urlState.filters };

  return (
    <BeithadyShell
      containerClass="max-w-[1400px]"
      breadcrumbs={[
        { label: 'Beithady', href: '/beithady' },
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Pace' },
      ]}
    >
      <Suspense>
        <PaceShell payload={payload} initialState={urlState} />
      </Suspense>
    </BeithadyShell>
  );
}
