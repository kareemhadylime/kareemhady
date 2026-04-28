import { SLA_BUCKET_CLASSES, SLA_BUCKET_DOT, SLA_BUCKET_LABELS, formatAge, type SlaBucket } from '@/lib/beithady/communication/sla';

export function SlaPill({
  bucket,
  ageSeconds,
  size = 'sm',
}: {
  bucket: SlaBucket;
  ageSeconds: number | null;
  size?: 'sm' | 'xs';
}) {
  const b: NonNullable<SlaBucket> = bucket ?? 'none';
  const cls = SLA_BUCKET_CLASSES[b];
  const dot = SLA_BUCKET_DOT[b];
  const label = b === 'none' ? SLA_BUCKET_LABELS.none : (formatAge(ageSeconds) || SLA_BUCKET_LABELS[b]);
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${px} ${cls}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
