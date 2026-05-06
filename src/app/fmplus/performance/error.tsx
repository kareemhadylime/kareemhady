'use client';
import { AlertOctagon } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex-1 p-8 text-center">
      <AlertOctagon size={32} className="text-red-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-slate-100">Performance Dashboard failed to load</h2>
      <p className="text-sm text-slate-400 mt-1">{error.message}</p>
      <button onClick={reset} className="mt-4 px-4 py-2 rounded-lg bg-fmplus-yellow text-fmplus-black text-sm font-semibold">
        Retry
      </button>
    </div>
  );
}
