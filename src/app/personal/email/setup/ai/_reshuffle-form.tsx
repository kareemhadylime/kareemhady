'use client';

import { useState, useTransition } from 'react';
import { Loader2, Shuffle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { reshuffleAll, type ReshuffleResult } from './actions';

// Reshuffle = re-evaluate every personal email_log against the current
// rule set (no Gmail call, no AI). Cheaper than Recompute and meant to
// be used immediately after rule edits to "reseat all the boxes".
export function ReshuffleForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ReshuffleResult | null>(null);

  function onClick() {
    setResult(null);
    start(async () => {
      const r = await reshuffleAll();
      setResult(r);
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="ix-btn-primary inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
      >
        {pending ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Reshuffling — re-running rules on all cached emails…
          </>
        ) : (
          <>
            <Shuffle size={14} />
            Reshuffle all boxes (rules-only)
          </>
        )}
      </button>

      {result && !pending && <ResultPanel result={result} />}
    </div>
  );
}

function ResultPanel({ result }: { result: ReshuffleResult }) {
  const ok = result.ok && !result.topLevelError;
  const accent = ok
    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'
    : 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30';
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  const iconClass = ok
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';

  return (
    <div className={`rounded-md border ${accent} px-3 py-2.5 space-y-1 text-xs`}>
      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
        <Icon size={14} className={iconClass} />
        <strong>
          {ok
            ? 'Reshuffle complete'
            : `Reshuffle failed${result.topLevelError ? ': ' + result.topLevelError : ''}`}
        </strong>
        <span className="text-slate-500 dark:text-slate-400">
          · {(result.durationMs / 1000).toFixed(1)} s
        </span>
      </div>

      <div className="text-slate-700 dark:text-slate-200">
        Scanned <strong>{result.scanned.toLocaleString()}</strong>:{' '}
        moved <strong>{result.movedByRule.toLocaleString()}</strong> by rule,{' '}
        kept <strong>{result.unchanged.toLocaleString()}</strong> unchanged,{' '}
        preserved <strong>{result.manualKept.toLocaleString()}</strong> manual moves.
      </div>
    </div>
  );
}
