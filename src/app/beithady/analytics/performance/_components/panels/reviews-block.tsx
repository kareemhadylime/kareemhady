'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload, ReviewSummary } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const STAR_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: '#003462',
  4: '#b3bbcb',
  3: '#b3bbcb',
  2: '#b3bbcb',
  1: '#dc2626',
};

export function ReviewsBlock({ payload, onHide }: Props) {
  const r = payload.reviews;
  const max = Math.max(...r.star_distribution.map((s) => s.count), 1);
  return (
    <PanelFrame
      label={`⭐ Reviews · ${payload.month_label} · last 24h`}
      onHide={onHide}
      drillTo="/beithady/analytics/reviews?period=mtd"
    >
      <div className="flex gap-4">
        <div className="flex items-end gap-1.5" style={{ height: 48 }}>
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const entry = r.star_distribution.find((s) => s.stars === stars);
            const count = entry?.count ?? 0;
            const h = Math.max(2, (count / max) * 40);
            return (
              <div key={stars} className="flex flex-col items-center gap-1">
                <div
                  className="w-3 rounded-sm"
                  style={{ height: h, background: STAR_COLORS[stars] }}
                  aria-hidden="true"
                />
                <span className="text-[8px] text-[#6077a6]">{stars}★</span>
                <span className="text-[8px] text-[#003462] font-medium">{count}</span>
              </div>
            );
          })}
        </div>
        <ul className="flex-1 flex flex-col gap-1 text-[10px] text-[#003462]">
          <li className="font-semibold">Last 24h · {r.last_24h.length} reviews</li>
          {r.last_24h.slice(0, 6).map((rv: ReviewSummary, i: number) => (
            <li key={i} className={rv.flagged ? 'text-red-600' : ''}>
              {rv.unit} · {rv.rating ?? '—'}★
              {rv.flagged ? ' 🚩' : ''}
              {rv.ai_summary ? ` "${rv.ai_summary.slice(0, 50)}${rv.ai_summary.length > 50 ? '…' : ''}"` : ''}
            </li>
          ))}
          {r.last_24h.length === 0 && <li className="text-[#6077a6]">No new reviews in the last 24h</li>}
        </ul>
      </div>
      {payload.review_topics && (payload.review_topics.praised.length > 0 || payload.review_topics.complained.length > 0) && (
        <div className="mt-3 border-t border-[#003462]/10 pt-2 text-[10px]">
          <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6077a6]/80">
            <span aria-hidden="true">✨</span>
            <span>AI Topics</span>
          </div>
          {payload.review_topics.praised.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[#6077a6]">Praised:</span>
              {payload.review_topics.praised.map((t) => (
                <span key={t.topic} className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700" title={t.example ?? undefined}>
                  {t.topic} · {t.count}
                </span>
              ))}
            </div>
          )}
          {payload.review_topics.complained.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[#6077a6]">Complained:</span>
              {payload.review_topics.complained.map((t) => (
                <span key={t.topic} className="rounded bg-red-100 px-1.5 py-0.5 text-red-700" title={t.example ?? undefined}>
                  {t.topic} · {t.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
