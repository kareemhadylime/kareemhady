import { Calendar, Layers, FileSpreadsheet } from 'lucide-react';
import { PillLink } from './PeriodControls';
import type { Granularity, ScopeMode } from '@/lib/fmplus/types';

const GRANULARITIES: Array<{ id: Granularity; label: string }> = [
  { id: 'monthly',   label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly',    label: 'Yearly' },
];

const PERIOD_COUNTS = [1, 3, 6, 12];

const MODES: Array<{ id: ScopeMode; label: string }> = [
  { id: 'trend',    label: 'Period Trend' },
  { id: 'plans',    label: 'Plans Compare' },
  { id: 'accounts', label: 'Accounts Compare' },
];

function asofPlaceholder(g: Granularity): string {
  if (g === 'monthly')   return 'YYYY-MM';
  if (g === 'quarterly') return 'YYYY-Q1';
  return 'YYYY';
}

function ToggleLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
      }`}
    >
      <span className={`w-3 h-3 rounded-sm border ${active ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-slate-300'}`}>
        {active && <span className="block text-white text-[9px] leading-3 text-center">✓</span>}
      </span>
      {label}
    </a>
  );
}

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
  const isBs = props.view === 'balance_sheet';
  return (
    <section className="ix-card p-4 space-y-3 sticky top-0 z-10 bg-white">
      {/* Granularity */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5 mr-2">
          <Calendar size={13} /> Granularity
        </span>
        {GRANULARITIES.map(g => (
          <PillLink
            key={g.id}
            href={props.buildHref({ granularity: g.id, asof: '' })}
            label={g.label}
            active={props.granularity === g.id}
          />
        ))}
      </div>

      {/* Periods + as-of */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium mr-2">Periods</span>
        {PERIOD_COUNTS.map(n => (
          <PillLink
            key={n}
            href={props.buildHref({ periods: String(n) })}
            label={String(n)}
            active={props.periods === n}
          />
        ))}
        <span className="text-xs text-slate-500 ml-3">As of</span>
        <form action="" method="get" className="inline-flex items-center gap-1.5">
          <input type="hidden" name="view" value={props.view} />
          <input type="hidden" name="granularity" value={props.granularity} />
          <input type="hidden" name="periods" value={String(props.periods)} />
          <input type="hidden" name="mode" value={props.mode} />
          <input type="hidden" name="with_dep" value={props.withDep ? '1' : '0'} />
          <input type="hidden" name="include_drafts" value={props.includeDrafts ? '1' : '0'} />
          <input
            type="text"
            name="asof"
            defaultValue={props.asof}
            className="ix-input w-[120px] text-sm"
            placeholder={asofPlaceholder(props.granularity)}
          />
          <button type="submit" className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs">Go</button>
        </form>
      </div>

      {/* Mode toggle (hidden on BS) */}
      {!isBs && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1.5 mr-2">
            <Layers size={13} /> Mode
          </span>
          {MODES.map(m => (
            <PillLink
              key={m.id}
              href={props.buildHref({ mode: m.id, plans: '', plan: '', accounts: '' })}
              label={m.label}
              active={props.mode === m.id}
            />
          ))}
        </div>
      )}
      {isBs && (
        <p className="text-[11px] text-slate-500 italic">
          Balance Sheet is whole-company; project scoping doesn&apos;t apply.
        </p>
      )}

      {/* Mode-specific picker stub (real picker ships in Task 16) */}
      {/* TODO: replace with <AccountPicker /> once Task 16 lands */}
      {!isBs && props.mode !== 'trend' && (
        <div className="ix-card p-3 bg-amber-50/30 text-xs text-slate-500">
          Account picker UI lands in Task 16 ({props.mode} mode).
        </div>
      )}

      {/* Options */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
        <FileSpreadsheet size={13} className="text-slate-400" />
        <ToggleLink
          label="Include drafts"
          active={props.includeDrafts}
          href={props.buildHref({ include_drafts: props.includeDrafts ? '0' : '1' })}
        />
        <ToggleLink
          label="Show depreciation in COGS"
          active={props.withDep}
          href={props.buildHref({ with_dep: props.withDep ? '0' : '1' })}
        />
      </div>
    </section>
  );
}
