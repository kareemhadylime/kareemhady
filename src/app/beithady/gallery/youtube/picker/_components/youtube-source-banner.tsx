import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export function YouTubeSourceBanner({
  ytVideoId,
  title,
  durationSeconds,
  isShorts,
  viewCount,
  publishPagePath,
}: {
  ytVideoId: string;
  title: string;
  durationSeconds: number | null;
  isShorts: boolean;
  viewCount: number;
  publishPagePath: string;
}) {
  const fmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const durationLabel = durationSeconds == null ? '—'
    : durationSeconds < 60 ? `${durationSeconds}s`
    : `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`;
  return (
    <div className="ix-card border-rose-200 bg-rose-50 dark:bg-rose-950 p-3 text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="font-semibold">▶ Source: YouTube video</span>{' '}
          <span className="font-mono text-xs text-slate-600">#{ytVideoId}</span>
          <div className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
            &ldquo;{title}&rdquo; · {durationLabel} · {isShorts ? 'Shorts' : 'Long-form'} · Views {viewCount ? fmt.format(viewCount) : '—'}
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <a href={`https://youtu.be/${ytVideoId}`} target="_blank" rel="noreferrer" className="ix-link inline-flex items-center gap-1">
            Open on YouTube <ExternalLink size={10} />
          </a>
          <Link href={publishPagePath} className="ix-link">Switch source</Link>
        </div>
      </div>
    </div>
  );
}
