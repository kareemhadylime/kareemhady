'use client';

import { useActionState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { recomputeRange, type RecomputeResult } from './actions';

export function RecomputeForm({
  defaultFromIso,
  defaultToIso,
}: {
  defaultFromIso: string;
  defaultToIso: string;
}) {
  const [state, formAction, pending] = useActionState<RecomputeResult | null, FormData>(
    recomputeRange,
    null,
  );

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex items-end gap-2 flex-wrap">
        <label className="block">
          <span className="block text-xs text-slate-600 dark:text-slate-300 mb-1">From</span>
          <input
            type="date"
            name="from_iso"
            defaultValue={defaultFromIso}
            disabled={pending}
            className="ix-input"
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs text-slate-600 dark:text-slate-300 mb-1">To</span>
          <input
            type="date"
            name="to_iso"
            defaultValue={defaultToIso}
            disabled={pending}
            className="ix-input"
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="ix-btn-primary inline-flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-wait"
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Recomputing — clearing + re-ingesting…
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Recompute range
            </>
          )}
        </button>
      </form>

      {pending && <PendingHint />}
      {state && !pending && <ResultPanel result={state} />}
    </div>
  );
}

function PendingHint() {
  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <p>
        <Loader2 size={12} className="inline-block animate-spin mr-1" />
        Step 1 of 2: clearing the <code>category</code> column for every
        personal-domain email in the range. Step 2: triggering an immediate
        ingest so the new rules + AI prompt re-classify everything. Don&apos;t
        close the tab — for big ranges this can take 1-3 minutes.
      </p>
    </div>
  );
}

function ResultPanel({ result }: { result: RecomputeResult }) {
  const overallOk = result.ok && !result.topLevelError;
  const accentClass = overallOk
    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'
    : 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30';
  const Icon = overallOk ? CheckCircle2 : AlertTriangle;
  const iconClass = overallOk
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';

  return (
    <div className={`rounded-md border ${accentClass} px-3 py-2.5 space-y-1 text-xs`}>
      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
        <Icon size={14} className={iconClass} />
        <strong>
          {overallOk
            ? 'Recompute complete'
            : `Recompute failed${result.topLevelError ? ': ' + result.topLevelError : ''}`}
        </strong>
        <span className="text-slate-500 dark:text-slate-400">
          · {(result.durationMs / 1000).toFixed(1)} s
        </span>
      </div>

      <div className="text-slate-700 dark:text-slate-200">
        Range <code>{result.fromIso}</code> → <code>{result.toIso}</code>:
        cleared <strong>{result.emailsCleared.toLocaleString()}</strong> classifications.{' '}
        {result.ingestStarted
          ? <>Ingest started ({result.ingestRunId
              ? <code>{result.ingestRunId.slice(0, 8)}</code>
              : 'no id'}). New categorisations will appear on the main triage page within ~1 min.</>
          : result.ingestError
            ? <span className="text-rose-700 dark:text-rose-300">Post-clear ingest failed: {result.ingestError}</span>
            : 'Ingest not triggered.'}
      </div>
    </div>
  );
}
