import { Calendar, Layers, FileSpreadsheet, ChevronRight } from 'lucide-react';
import { PillLink } from './PeriodControls';
import type { Granularity, ScopeMode } from '@/lib/fmplus/types';

const GRANULARITIES: Array<{ id: Granularity; label: string }> = [
  { id: 'monthly',   label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'yearly',    label: 'Yearly' },
];

const PERIOD_COUNTS = [1, 3, 6, 12];

// Plans Compare and Accounts Compare are deferred to v2 — the underlying
// RPC currently widens the filter without pivoting columns by plan/account,
// which would mislead users. Re-enable once pnl_aggregated_multiperiod
// supports a p_pivot_dimension parameter and the renderer keys columns
// off the pivoted axis.
const MODES: Array<{ id: ScopeMode; label: string }> = [
  { id: 'trend',    label: 'Period Trend' },
];

// Build the year-month options the user can pick from. Defaults to a
// 36-month window ending at the current month — wide enough to backfill
// to any reasonable historical period without an unbounded dropdown.
function monthOptions(asof: string, count = 36): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const value = `${y}-${String(m).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    out.push({ value, label });
  }
  // Surface the currently-selected asof at the top if it's outside the window
  if (asof && /^\d{4}-\d{2}$/.test(asof) && !out.some(o => o.value === asof)) {
    const [y, m] = asof.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    out.unshift({
      value: asof,
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    });
  }
  return out;
}

function quarterOptions(asof: string, count = 16): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    const value = `${y}-Q${q}`;
    const label = `Q${q} ${y}`;
    out.push({ value, label });
    q -= 1;
    if (q < 1) { q = 4; y -= 1; }
  }
  if (asof && /^\d{4}-Q[1-4]$/.test(asof) && !out.some(o => o.value === asof)) {
    out.unshift({ value: asof, label: asof.replace('-', ' ') });
  }
  return out;
}

function yearOptions(asof: string, count = 8): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const y = now.getUTCFullYear() - i;
    out.push({ value: String(y), label: String(y) });
  }
  if (asof && /^\d{4}$/.test(asof) && !out.some(o => o.value === asof)) {
    out.unshift({ value: asof, label: asof });
  }
  return out;
}

function FilterRow({ icon: Icon, label, children }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center gap-1.5 min-w-[110px] pt-1.5">
        <Icon size={13} className="text-slate-400 dark:text-slate-500" />
        <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
          {label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 flex-1">{children}</div>
    </div>
  );
}

export function FilterBar(props: {
  view: 'dashboard' | 'pnl' | 'balance_sheet';
  granularity: Granularity;
  periods: number;
  asof: string;
  mode: ScopeMode;
  withDep: boolean;
  includeDrafts: boolean;
  buildHref: (overrides?: Partial<Record<string, string | undefined>>) => string;
}) {
  const isBs = props.view === 'balance_sheet';
  const asofOptions =
    props.granularity === 'monthly'   ? monthOptions(props.asof) :
    props.granularity === 'quarterly' ? quarterOptions(props.asof) :
                                        yearOptions(props.asof);

  return (
    <section className="ix-card p-5 space-y-4 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-slate-900/80">
      <FilterRow icon={Calendar} label="Granularity">
        {GRANULARITIES.map(g => (
          <PillLink
            key={g.id}
            href={props.buildHref({ granularity: g.id, asof: '' })}
            label={g.label}
            active={props.granularity === g.id}
          />
        ))}
      </FilterRow>

      <FilterRow icon={ChevronRight} label="Periods">
        {PERIOD_COUNTS.map(n => (
          <PillLink
            key={n}
            href={props.buildHref({ periods: String(n) })}
            label={String(n)}
            active={props.periods === n}
          />
        ))}
        <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-3 font-medium uppercase tracking-wide">As of</span>
        <form action="" method="get" className="inline-flex items-center gap-1.5">
          <input type="hidden" name="view" value={props.view} />
          <input type="hidden" name="granularity" value={props.granularity} />
          <input type="hidden" name="periods" value={String(props.periods)} />
          <input type="hidden" name="mode" value={props.mode} />
          <input type="hidden" name="with_dep" value={props.withDep ? '1' : '0'} />
          <input type="hidden" name="include_drafts" value={props.includeDrafts ? '1' : '0'} />
          <select
            name="asof"
            defaultValue={props.asof}
            className="ix-input text-sm px-2.5 py-1.5 cursor-pointer min-w-[140px]"
          >
            {asofOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition shadow-sm"
          >
            Apply
          </button>
        </form>
      </FilterRow>

      {!isBs && MODES.length > 1 && (
        <FilterRow icon={Layers} label="Mode">
          {MODES.map(m => (
            <PillLink
              key={m.id}
              href={props.buildHref({ mode: m.id, plans: '', plan: '', accounts: '' })}
              label={m.label}
              active={props.mode === m.id}
            />
          ))}
        </FilterRow>
      )}
      {isBs && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic ml-[122px]">
          Balance Sheet is whole-company; project scoping doesn&apos;t apply.
        </p>
      )}

      <FilterRow icon={FileSpreadsheet} label="Options">
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
      </FilterRow>
    </section>
  );
}

function ToggleLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
        active
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800'
          : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      <span
        className={`w-3.5 h-3.5 rounded border inline-flex items-center justify-center text-[9px] leading-none ${
          active
            ? 'bg-emerald-500 border-emerald-600 text-white'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
        }`}
      >
        {active && '✓'}
      </span>
      {label}
    </a>
  );
}
