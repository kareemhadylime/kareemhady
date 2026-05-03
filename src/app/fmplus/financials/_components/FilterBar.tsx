import type { Granularity, ScopeMode } from '@/lib/fmplus/types';

export function FilterBar(props: {
  view: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity: Granularity;
  periods: number;
  asof: string;
  mode: ScopeMode;
  planIds?: number[];
  planId?: number;
  accountIds?: number[];
  withDep: boolean;
  includeDrafts: boolean;
  buildHref: (overrides?: Partial<Record<string, string | undefined>>) => string;
}) {
  return (
    <div className="ix-card p-3 text-xs text-slate-500">
      Filter bar stub — granularity={props.granularity} · periods={props.periods} · asof={props.asof} · mode={props.mode}
    </div>
  );
}
