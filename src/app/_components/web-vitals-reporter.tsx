'use client';
import { useReportWebVitals } from 'next/web-vitals';
import { usePathname } from 'next/navigation';

// Client-only Web Vitals reporter. Mounted in /stay/[code]/layout (and
// any other public landing-page layouts) so anonymous visitor metrics
// flow to /api/web-vitals. Operator pages (which require auth) don't
// need this — those are not what Google measures for ad quality score.

export function WebVitalsReporter({ buildingCode }: { buildingCode?: string }) {
  const path = usePathname();
  useReportWebVitals(metric => {
    const body = JSON.stringify({
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      path,
      building_code: buildingCode || null,
      navigation_type: metric.navigationType,
    });
    // Prefer sendBeacon for reliability on page unload; fall back to fetch.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/web-vitals', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/web-vitals', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => undefined);
    }
  });
  return null;
}
