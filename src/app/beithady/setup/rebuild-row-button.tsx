'use client';
import { useState, useTransition } from 'react';
import { rebuildSnapshotAction } from './actions';

type Props = { date: string; isMissing: boolean };

/**
 * Per-row rebuild trigger for the "Recent reports" table on
 * /beithady/setup. Calls the admin-only `rebuildSnapshotAction` server
 * action which runs `runDailyReport` for the given date with
 * `forceRebuild + skipDistribution`. The build can take 60-180s — the
 * setup page sets `maxDuration = 180` to match.
 */
export function RebuildRowButton({ date, isMissing }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleClick = () => {
    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        const result = await rebuildSnapshotAction(date);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOk(true);
        // Soft refresh — list shows updated status without losing scroll
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          isMissing
            ? 'rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60'
            : 'rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
        }
      >
        {pending ? 'Building…' : isMissing ? 'Rebuild' : 'Rebuild'}
      </button>
      {error && (
        <span className="text-[10px] text-rose-600 dark:text-rose-400">
          {error === 'forbidden' ? 'admin only' : error.slice(0, 40)}
        </span>
      )}
      {ok && !pending && (
        <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
          done · reloading
        </span>
      )}
    </div>
  );
}
