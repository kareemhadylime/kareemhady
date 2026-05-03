import { fmtCairoDateTime } from '@/lib/fmt-date';
import { getCategory } from '@/lib/personal-email/categories';

export function ClassificationCard({
  category, confidence, method, reason, lastClassifiedAt, needsReview,
}: {
  category: string | null;
  confidence: number | null;
  method: string | null;
  reason: string | null;
  lastClassifiedAt: string | null;
  needsReview: boolean;
}) {
  const cat = category ? getCategory(category) : null;
  const accent = cat?.accentColor ?? 'slate';
  return (
    <div className={`ix-card p-4 border-l-4 border-${accent}-500`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        AI classification
      </div>
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="font-bold">{cat?.displayName ?? category ?? 'unclassified'}</span>
        {confidence !== null && (
          <span className="text-slate-600">Confidence: {confidence.toFixed(2)}</span>
        )}
        {method && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
            {method}
          </span>
        )}
        {needsReview && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
            needs review
          </span>
        )}
      </div>
      {reason && <div className="text-xs text-slate-600 mt-1.5 italic">&quot;{reason}&quot;</div>}
      {lastClassifiedAt && (
        <div className="text-[11px] text-slate-400 mt-1">
          Classified {fmtCairoDateTime(lastClassifiedAt)}
        </div>
      )}
    </div>
  );
}
