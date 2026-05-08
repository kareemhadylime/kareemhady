'use client';

import { useEffect } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

// Beithady root error boundary. Catches any uncaught throw from a server
// action / RSC / client component within the /beithady tree and renders
// a brand-consistent fallback instead of Next's red overlay.
//
// Logged via console.error so the digest + stack reach Vercel logs; the
// user only sees the digest (safe) so internal table/column names from
// Postgres errors don't leak through.
export default function BeithadyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[beithady error boundary]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
          <AlertOctagon size={22} className="text-slate-700 dark:text-slate-300" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          We couldn&apos;t load this page. The team has been notified.
        </p>
        {error.digest && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 font-mono">
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium transition"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    </div>
  );
}
