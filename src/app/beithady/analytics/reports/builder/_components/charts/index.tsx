'use client';

import dynamic from 'next/dynamic';

// Lazy wrappers around the recharts-based chart components. Without
// these, ~350 KB of recharts ships in the initial bundle on every
// route that shares chunks with the report builder/viewer. With
// ssr:false, the charts render after hydration on the relevant pages
// only.

const FALLBACK = (
  <div className="rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse h-64" />
);

export const ChartsPanel = dynamic(
  () =>
    import('./index-impl').then(m => ({ default: m.ChartsPanel })),
  { ssr: false, loading: () => FALLBACK },
);

export const KpiStrip = dynamic(
  () =>
    import('./index-impl').then(m => ({ default: m.KpiStrip })),
  { ssr: false, loading: () => <div className="h-20" /> },
);

export const PivotTable = dynamic(
  () =>
    import('./index-impl').then(m => ({ default: m.PivotTable })),
  { ssr: false, loading: () => FALLBACK },
);
