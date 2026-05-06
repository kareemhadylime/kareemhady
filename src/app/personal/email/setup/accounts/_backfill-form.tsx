'use client';

import { useActionState } from 'react';
import { Archive, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { archiveOldAndResetSync, type BackfillResult } from './actions';

// Default cutoff = 2026-04-15 per the user's spec; editable.
const DEFAULT_CUTOFF = '2026-04-15';

export function BackfillForm() {
  const [state, formAction, pending] = useActionState<BackfillResult | null, FormData>(
    archiveOldAndResetSync,
    null,
  );

  return (
    <section className="ix-card p-4 space-y-3 border-amber-200 dark:border-amber-900">
      <div className="flex items-center gap-2">
        <Archive size={16} className="text-amber-700 dark:text-amber-300" />
        <h2 className="text-sm uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-200">
          Backfill — archive old + ingest from cutoff
        </h2>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        For every personal mailbox: mark-read + remove the INBOX label
        (= archive in Gmail) on every message dated <strong>before</strong>{' '}
        the cutoff, then reset <code>last_synced_at</code> to that cutoff
        so the next ingest fetches everything from the cutoff forward.
        Useful for resetting an inbox before a clean catch-up.
        Press once and wait — the action loops through every account
        and triggers an ingest at the end. Can take 1–3 minutes for
        large mailboxes.
      </p>

      <form action={formAction} className="flex items-end gap-2 flex-wrap">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            Cutoff (YYYY-MM-DD)
          </span>
          <input
            type="date"
            name="cutoff"
            defaultValue={DEFAULT_CUTOFF}
            required
            disabled={pending}
            className="ix-input"
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
              Working — looping accounts…
            </>
          ) : (
            <>
              <Archive size={14} />
              Archive + reset
            </>
          )}
        </button>
      </form>

      {pending && <PendingHint />}
      {state && !pending && <ResultPanel result={state} />}
    </section>
  );
}

function PendingHint() {
  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
      <p>
        <Loader2 size={12} className="inline-block animate-spin mr-1" />
        Per account: token refresh → list pre-cutoff Gmail messages →
        batch-archive 1000 at a time → reset sweep cursor. Ingest fires
        at the end. Don&apos;t close the tab.
      </p>
    </div>
  );
}

function ResultPanel({ result }: { result: BackfillResult }) {
  const overallOk = result.ok && !result.topLevelError;
  const accentClass = overallOk
    ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'
    : 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30';
  const Icon = overallOk ? CheckCircle2 : AlertTriangle;
  const iconClass = overallOk
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';

  return (
    <div className={`rounded-md border ${accentClass} px-3 py-2.5 space-y-2 text-xs`}>
      <div className="flex items-center gap-2 text-slate-900 dark:text-slate-50">
        <Icon size={14} className={iconClass} />
        <strong>
          {overallOk
            ? 'Backfill complete'
            : `Backfill finished with errors${result.topLevelError ? ': ' + result.topLevelError : ''}`}
        </strong>
        <span className="text-slate-500 dark:text-slate-400">
          · {(result.durationMs / 1000).toFixed(1)} s
        </span>
      </div>

      <div className="text-slate-700 dark:text-slate-200">
        Cutoff <code>{result.cutoff}</code> · archived{' '}
        <strong>{result.totalArchived.toLocaleString()}</strong> of{' '}
        {result.totalBeforeCutoff.toLocaleString()} pre-cutoff messages.{' '}
        {result.ingestStarted
          ? 'Ingest kicked off — fresh classifications will appear shortly on the main page.'
          : result.ingestError
            ? <span className="text-rose-700 dark:text-rose-300">Post-archive ingest failed: {result.ingestError}</span>
            : 'Ingest not triggered.'}
      </div>

      <ul className="divide-y divide-slate-200 dark:divide-slate-700 mt-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
        {result.perAccount.map(a => (
          <li key={a.email} className="flex items-center gap-2 px-3 py-1.5">
            <span className="font-mono truncate flex-1 text-slate-800 dark:text-slate-200">
              {a.display_name ?? '—'} · {a.email}
            </span>
            {a.error ? (
              <span className="text-rose-600 dark:text-rose-400" title={a.error}>
                error: {a.error.slice(0, 60)}
              </span>
            ) : (
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                archived <strong className="text-slate-900 dark:text-slate-50">{a.archived.toLocaleString()}</strong>
                <span className="opacity-60"> / {a.before_cutoff.toLocaleString()}</span>
              </span>
            )}
          </li>
        ))}
        {result.perAccount.length === 0 && (
          <li className="px-3 py-2 text-slate-500 dark:text-slate-400">
            No personal accounts found.
          </li>
        )}
      </ul>
    </div>
  );
}
