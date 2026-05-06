'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Client-side wrapper for the As-of period selector. Lifts the form
// submit into `router.push` + `useTransition` so the Apply button can
// show a spinner during navigation.

export function AsOfForm({
  view,
  granularity,
  periods,
  mode,
  withDep,
  includeDrafts,
  asof,
  options,
  hidden,
}: {
  view: string;
  granularity: string;
  periods: number;
  mode: string;
  withDep: boolean;
  includeDrafts: boolean;
  asof: string;
  options: Array<{ value: string; label: string }>;
  /** Extra hidden params that must be preserved across the period change
   *  (plan, account, accounts, multi). Server passes the live values. */
  hidden?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const qs = new URLSearchParams();
        for (const [k, v] of fd.entries()) {
          if (typeof v === 'string' && v !== '') qs.set(k, v);
        }
        startTransition(() => {
          router.push(`?${qs.toString()}`);
        });
      }}
      className="inline-flex items-center gap-1.5"
    >
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="granularity" value={granularity} />
      <input type="hidden" name="periods" value={String(periods)} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="with_dep" value={withDep ? '1' : '0'} />
      <input type="hidden" name="include_drafts" value={includeDrafts ? '1' : '0'} />
      {hidden &&
        Object.entries(hidden)
          .filter(([, v]) => v != null && v !== '')
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v as string} />)}
      <select
        name="asof"
        defaultValue={asof}
        className="ix-input text-sm px-2.5 py-1.5 cursor-pointer min-w-[140px]"
        disabled={pending}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-70 disabled:cursor-wait text-white text-sm font-medium transition shadow-sm"
      >
        {pending && <Loader2 size={13} className="animate-spin" />}
        {pending ? 'Loading…' : 'Apply'}
      </button>
    </form>
  );
}
