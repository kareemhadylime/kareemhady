// src/app/beithady/gallery/youtube/_components/recent-uploads-table.tsx
import { RefreshCw } from 'lucide-react';
import { fmtCairoDate } from '@/lib/fmt-date';
import { retryUploadAction } from '../actions';

const fmtNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

type Row = {
  id: number;
  title: string;
  status: 'queued' | 'uploading' | 'processing' | 'published' | 'error';
  is_shorts: boolean;
  duration_seconds: number | null;
  privacy_status: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  watch_url: string | null;
  error: string | null;
  created_at: string;
  next_retry_at: string | null;
};

const STATUS_BADGE: Record<Row['status'], string> = {
  queued:     'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  uploading:  'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200',
  published:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  error:      'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
};

function fmtDuration(s: number | null): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function RecentUploadsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-500">No uploads yet.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left border-b border-slate-200 dark:border-slate-700">
          <th className="py-2 pr-3">When</th>
          <th className="py-2 pr-3">Title</th>
          <th className="py-2 pr-3">Status</th>
          <th className="py-2 pr-3">Length</th>
          <th className="py-2 pr-3">Privacy</th>
          <th className="py-2 pr-3 text-right">Views</th>
          <th className="py-2 pr-3 text-right">Likes</th>
          <th className="py-2 pr-3"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
            <td className="py-2 pr-3">{fmtCairoDate(r.created_at)}</td>
            <td className="py-2 pr-3 max-w-xs truncate">{r.title}</td>
            <td className="py-2 pr-3">
              <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[r.status]}`}>
                {r.status}
              </span>
              {r.error && <span className="ml-1 text-[10px] text-rose-500" title={r.error}>ⓘ</span>}
            </td>
            <td className="py-2 pr-3 tabular-nums">{fmtDuration(r.duration_seconds)}</td>
            <td className="py-2 pr-3">{r.privacy_status}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{r.view_count ? fmtNumber.format(r.view_count) : '—'}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{r.like_count ? fmtNumber.format(r.like_count) : '—'}</td>
            <td className="py-2 pr-3">
              {r.status === 'published' && r.watch_url && (
                <a href={r.watch_url} target="_blank" rel="noreferrer" className="ix-link text-[11px]">open ↗</a>
              )}
              {r.status === 'error' && (
                <form action={retryUploadAction} className="inline">
                  <input type="hidden" name="row_id" value={r.id} />
                  <button className="ix-link text-[11px] inline-flex items-center gap-1">
                    <RefreshCw size={10} /> Retry
                  </button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
