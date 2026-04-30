'use client';

import { useState, useTransition } from 'react';
import { DollarSign, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { syncAllAmazonPricesAction } from '../actions';

// Header CTA — visible only when ≥1 item has an Amazon EG URL set.
// Click queues a background probe of every URL and returns the count
// queued so the operator knows it's working. The items page auto-poll
// (already running while ai_info_status spinners are visible) doesn't
// catch price updates; price refreshes show up on next manual reload.

export function SyncPricesButton({ candidateCount }: { candidateCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (candidateCount === 0) return null;

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await syncAllAmazonPricesAction();
      if (res.ok) {
        setResult(`Probing ${res.queued} URL${res.queued === 1 ? '' : 's'} — refresh in ~2 min`);
        // Refresh after ~10s so the operator sees the first few prices land
        setTimeout(() => router.refresh(), 10000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        title={`Probe Amazon EG for live prices on ${candidateCount} item${candidateCount === 1 ? '' : 's'} with a URL set`}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
        Sync prices ({candidateCount})
      </button>
      {result && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
          <Check size={11} strokeWidth={3} /> {result}
        </span>
      )}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 dark:text-rose-300">
          <AlertTriangle size={11} /> {error}
        </span>
      )}
    </div>
  );
}
