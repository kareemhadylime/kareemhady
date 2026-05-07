'use client';
import type { DailyReportPayload, AIInsight } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const TONE_DOT: Record<AIInsight['tone'], string> = {
  positive: 'bg-emerald-400',
  neutral:  'bg-slate-400',
  warning:  'bg-amber-400',
};

export function AIInsightsTray({ payload, onHide }: Props) {
  const insights = payload.insights ?? [];
  if (insights.length === 0) {
    return null;  // no AI key or empty result — hide entirely (don't show empty placeholder for the hero callout)
  }
  return (
    <section
      className="group relative rounded-lg p-4 sm:p-5 text-[#eae9f3]"
      style={{
        background: 'linear-gradient(135deg, var(--bh-ink) 0%, #2c4d7a 100%)',
      }}
      aria-label="AI Insights"
    >
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="absolute right-2 top-2 text-[11px] text-white/40 opacity-0 transition motion-reduce:transition-none group-hover:opacity-100 hover:text-white/80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[#003462] rounded"
          aria-label="Hide AI Insights"
        >
          ×
        </button>
      )}
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/70">
        <span aria-hidden="true">✨</span>
        <span>AI Insights</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {insights.map((ins, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed">
            <span className={`mt-1.5 inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[ins.tone] ?? TONE_DOT.neutral}`} aria-hidden="true" />
            <span>{ins.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
