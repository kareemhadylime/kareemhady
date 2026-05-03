'use client';
import { useState, useTransition } from 'react';
import { updateThresholdsAction } from '../actions';

export function ThresholdEditor({ green, amber }: { green: number; amber: number }) {
  const [g, setG] = useState(green);
  const [a, setA] = useState(amber);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <label className="text-sm">Green ≤&nbsp;
        <input type="number" step="0.5" value={g} onChange={e => setG(Number(e.currentTarget.value))}
               className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-right" />
        %
      </label>
      <label className="text-sm">Amber ≤&nbsp;
        <input type="number" step="0.5" value={a} onChange={e => setA(Number(e.currentTarget.value))}
               className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 text-right" />
        %
      </label>
      <button disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await updateThresholdsAction({ green_pct: g, amber_pct: a });
                setMsg(res.ok ? 'Saved.' : `Error: ${res.error}`);
              })}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm">{pending ? 'Saving…' : 'Save'}</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
