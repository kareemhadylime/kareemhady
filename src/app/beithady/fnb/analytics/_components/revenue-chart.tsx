'use client';

import dynamic from 'next/dynamic';

// Lazy-load the recharts implementation. Without this, ~300 KB of
// recharts ships in the initial JS bundle on every Beithady page that
// shares chunks with this route. With ssr:false, the chart renders
// after hydration on the analytics page only.
export const RevenueChart = dynamic(
  () =>
    import('./revenue-chart-impl').then(m => ({ default: m.RevenueChart })),
  {
    ssr: false,
    loading: () => (
      <div className="ix-card p-4">
        <h3 className="text-sm font-semibold mb-3">Revenue — last 30 days</h3>
        <div className="h-60 rounded-md bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </div>
    ),
  },
);
