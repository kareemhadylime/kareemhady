import { Sparkles } from 'lucide-react';
import { generateAiSummaryAction } from '../actions';

export function AiSummaryCard({
  range, summary, usedToday,
}: {
  range: { from: string; to: string };
  summary: string | null;
  usedToday: number;
}) {
  const capReached = usedToday >= 20;
  const paragraphs = summary ? summary.split(/\n\n+/).filter(p => p.trim().length > 0) : [];

  return (
    <div className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Sparkles size={14} className="text-emerald-600" />
          <span>AI summary</span>
        </div>
        <form action={generateAiSummaryAction}>
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to" value={range.to} />
          <button
            type="submit"
            disabled={capReached}
            className={`ix-btn-secondary text-xs ${capReached ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={capReached ? 'Daily cap reached — resets at midnight Cairo' : 'Generates a 3-paragraph summary (~$0.01)'}
          >
            {capReached ? 'Cap reached' : 'Generate summary'}
          </button>
        </form>
      </div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">
        cost ~$0.01 · daily cap {usedToday}/20
      </div>
      {paragraphs.length > 0 ? (
        <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic">
          No summary yet for this date range. Click {capReached ? '"Cap reached"' : '"Generate summary"'} to create one.
        </div>
      )}
    </div>
  );
}
