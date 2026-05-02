'use client';
import { useEffect, useState } from 'react';
import { SLA_BUCKET_CLASSES, SLA_BUCKET_DOT, SLA_BUCKET_LABELS, formatAge, type SlaBucket } from '@/lib/beithady/communication/sla';

// Audit fix M-5: SlaPill now ticks live every 60s when the parent
// supplies `lastInboundAt`. Pre-fix the pill was a server component
// rendering frozen ageSeconds — on a long-lived inbox tab "5m" would
// stay "5m" until navigation, hiding the SLA breach. The minute-grain
// tick is enough since SLA buckets shift on minute/hour boundaries.

export function SlaPill({
  bucket,
  ageSeconds,
  lastInboundAt,
  size = 'sm',
}: {
  bucket: SlaBucket;
  ageSeconds: number | null;
  /** ISO timestamp of the last inbound. Optional — when provided,
   *  the pill recomputes age on a 60s interval client-side. */
  lastInboundAt?: string | null;
  size?: 'sm' | 'xs';
}) {
  const [liveAge, setLiveAge] = useState<number | null>(ageSeconds);
  useEffect(() => {
    if (!lastInboundAt) return;
    const t = Date.parse(lastInboundAt);
    if (!Number.isFinite(t)) return;
    const recompute = () => setLiveAge(Math.floor((Date.now() - t) / 1000));
    recompute();
    const interval = setInterval(recompute, 60_000);
    return () => clearInterval(interval);
  }, [lastInboundAt]);
  const b: NonNullable<SlaBucket> = bucket ?? 'none';
  const cls = SLA_BUCKET_CLASSES[b];
  const dot = SLA_BUCKET_DOT[b];
  const label = b === 'none' ? SLA_BUCKET_LABELS.none : (formatAge(liveAge) || SLA_BUCKET_LABELS[b]);
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${px} ${cls}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
