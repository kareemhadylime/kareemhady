import Link from 'next/link';

// Local type — accepts string from either of the two CompanyScope types
// in the codebase (the BH-financials types module and the legacy
// financials-pnl module both export a CompanyScope, with slightly different
// shapes). The type keeps 'a1' so direct ?scope=a1 URL bookmarks still
// resolve, but the SCOPES array below only renders consolidated/egypt/dubai
// — A1 is partner ownership, not a Beithady operating scope.
type CompanyScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';

// Minimal filter strip restored after the T15-T18 cockpit refactor dropped
// the original CompanyTabs/PeriodFilter components. Covers the 90% case:
// scope (consolidated/egypt/dubai) + period preset. Building/LOB analytic
// filters are deferred — operators who need them currently set URL params
// manually and we'll restore the analytic dropdowns when they're prioritised.

type PresetId =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year';

const PERIOD_PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
];

const SCOPES: Array<{ id: CompanyScope; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

export function FinancialsFilterStrip(props: {
  basePath: string; // e.g. '/beithady/financials/performance'
  activeScope: string; // intentionally string — see CompanyScope note above
  activePreset?: string;
  activeAsOf?: string; // for pages that key off as-of date instead of preset
  showPeriodPresets?: boolean;
  showAsOf?: boolean;
}) {
  const { basePath, activeScope, activePreset, activeAsOf, showPeriodPresets, showAsOf } = props;
  const hrefFor = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="space-y-2 mb-6">
      <nav className="flex flex-wrap gap-1 text-xs">
        {SCOPES.map((s) => (
          <Link
            key={s.id}
            href={hrefFor({
              scope: s.id,
              ...(activePreset ? { preset: activePreset } : {}),
              ...(activeAsOf ? { asof: activeAsOf } : {}),
            })}
            className={`px-2 py-1 rounded ${
              s.id === activeScope ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {showPeriodPresets ? (
        <nav className="flex flex-wrap gap-1 text-xs">
          {PERIOD_PRESETS.map((p) => (
            <Link
              key={p.id}
              href={hrefFor({ scope: activeScope, preset: p.id })}
              className={`px-2 py-1 rounded ${
                p.id === activePreset ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {showAsOf ? (
        <form className="flex items-center gap-2 text-xs">
          <label>As of:</label>
          <input type="hidden" name="scope" value={activeScope} />
          <input
            type="date"
            name="asof"
            defaultValue={activeAsOf || new Date().toISOString().slice(0, 10)}
            className="border rounded px-2 py-1"
          />
          <button type="submit" className="px-2 py-1 rounded bg-slate-900 text-white">
            Apply
          </button>
        </form>
      ) : null}
    </div>
  );
}
