'use client';

import { useTransition, useState } from 'react';
import { Wand2, Loader2, Check, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { generateAllMissingAiInfoAction } from '../actions';

// Header CTA — visible only when ≥1 active item is missing an AI info
// card. Click queues a background regen for every missing item; the
// table's auto-poll picks up status flips as each item completes.

export function BulkAiInfoButton({ missingCount }: { missingCount: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (missingCount === 0) return null;

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await generateAllMissingAiInfoAction();
      if (res.ok) {
        setResult(`Queued ${res.queued} item${res.queued === 1 ? '' : 's'} — regen runs in background`);
        router.refresh();
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
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-700 inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        title={`Generate AI info cards for ${missingCount} item${missingCount === 1 ? '' : 's'} that don't have one yet`}
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        AI info for {missingCount} missing
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
