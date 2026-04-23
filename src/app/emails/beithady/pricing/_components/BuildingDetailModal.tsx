'use client';

import { useMemo, useState } from 'react';
import { X, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { PricingListingRow, PricingHorizon } from '@/lib/pricelabs-pricing';

const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString('en-US');
};
const fmt1 = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(1);
};
const fmtPct = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toFixed(1)}%`;
};

// Every sortable column in the unit table. Key is the name we sort by,
// getter pulls the value off a PricingListingRow.
type SortKey =
  | 'name'
  | 'base'
  | 'adr_past_30'
  | 'adr_yoy_pct'
  | 'revenue_past_30'
  | 'revenue_yoy_pct'
  | 'occupancy'
  | 'market'
  | 'delta'
  | 'rec';

type SortConfig = { key: SortKey; dir: 'asc' | 'desc' };

type Props = {
  buildingCode: string;
  horizon: PricingHorizon;
  units: PricingListingRow[];
  onClose: () => void;
};

function getOccupancy(r: PricingListingRow, horizon: PricingHorizon): number | null {
  if (horizon === 7) return r.occupancy_next_7;
  if (horizon === 60) return r.occupancy_next_60;
  return r.occupancy_next_30;
}
function getMarket(r: PricingListingRow, horizon: PricingHorizon): number | null {
  if (horizon === 7) return r.market_occupancy_next_7;
  if (horizon === 60) return r.market_occupancy_next_60;
  return r.market_occupancy_next_30;
}
function getDelta(r: PricingListingRow, horizon: PricingHorizon): number | null {
  const o = getOccupancy(r, horizon);
  const m = getMarket(r, horizon);
  if (o == null || m == null) return null;
  return o - m;
}

// nulls-last comparator. Asc: small first / null last. Desc: big first / null last.
function cmp(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  dir: 'asc' | 'desc'
): number {
  const an = a == null || (typeof a === 'number' && !Number.isFinite(a));
  const bn = b == null || (typeof b === 'number' && !Number.isFinite(b));
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  }
  const na = Number(a),
    nb = Number(b);
  return dir === 'asc' ? na - nb : nb - na;
}

export function BuildingDetailModal({
  buildingCode,
  horizon,
  units,
  onClose,
}: Props) {
  const [sort, setSort] = useState<SortConfig>({
    key: 'revenue_past_30',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    const arr = [...units];
    const dir = sort.dir;
    arr.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return cmp(a.name, b.name, dir);
        case 'base':
          return cmp(a.base, b.base, dir);
        case 'adr_past_30':
          return cmp(a.adr_past_30, b.adr_past_30, dir);
        case 'adr_yoy_pct':
          return cmp(a.adr_yoy_pct, b.adr_yoy_pct, dir);
        case 'revenue_past_30':
          return cmp(a.revenue_past_30, b.revenue_past_30, dir);
        case 'revenue_yoy_pct':
          return cmp(a.revenue_yoy_pct, b.revenue_yoy_pct, dir);
        case 'occupancy':
          return cmp(getOccupancy(a, horizon), getOccupancy(b, horizon), dir);
        case 'market':
          return cmp(getMarket(a, horizon), getMarket(b, horizon), dir);
        case 'delta':
          return cmp(getDelta(a, horizon), getDelta(b, horizon), dir);
        case 'rec':
          return cmp(a.recommended_base_price, b.recommended_base_price, dir);
        default:
          return 0;
      }
    });
    return arr;
  }, [units, sort, horizon]);

  function setSortKey(key: SortKey) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  }

  function SortHeader({
    label,
    keyName,
    align = 'right',
  }: {
    label: string;
    keyName: SortKey;
    align?: 'left' | 'right' | 'center';
  }) {
    const active = sort.key === keyName;
    const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        className={`px-3 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wide select-none cursor-pointer hover:bg-slate-100 ${
          align === 'right'
            ? 'text-right'
            : align === 'center'
              ? 'text-center'
              : 'text-left'
        }`}
        onClick={() => setSortKey(keyName)}
      >
        <span
          className={`inline-flex items-center gap-1 ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''
          } ${active ? 'text-slate-900' : ''}`}
        >
          {label}
          <Icon size={11} className={active ? 'text-rose-600' : 'text-slate-400'} />
        </span>
      </th>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {buildingCode} · {units.length} listing{units.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ADR + revenue vs STLY (past 30d) · Occupancy next {horizon}d vs market · Click column headers to sort
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr>
                <SortHeader label="Listing" keyName="name" align="left" />
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wide text-center">
                  Units
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-600 uppercase tracking-wide text-center">
                  Push
                </th>
                <SortHeader label="Base" keyName="base" />
                <SortHeader label="ADR 30d" keyName="adr_past_30" />
                <SortHeader label="ADR YoY" keyName="adr_yoy_pct" />
                <SortHeader label="Rev 30d" keyName="revenue_past_30" />
                <SortHeader label="Rev YoY" keyName="revenue_yoy_pct" />
                <SortHeader label={`Occ ${horizon}d`} keyName="occupancy" />
                <SortHeader label="Market" keyName="market" />
                <SortHeader label="Δ pp" keyName="delta" />
                <SortHeader label="Rec Base" keyName="rec" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const occ = getOccupancy(r, horizon);
                const mkt = getMarket(r, horizon);
                const delta = getDelta(r, horizon);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-3 py-1.5 max-w-[280px]" title={r.name}>
                      <div className="truncate">{r.name}</div>
                      {r.channels?.length > 0 && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {r.channels.map(c => c.name).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.is_multi_unit_parent ? (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700"
                          title={`Multi-unit parent · ${r.unit_count} sub-units`}
                        >
                          {r.unit_count}×
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">1</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {r.push_enabled === true ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                      ) : r.push_enabled === false ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.base)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmt(r.adr_past_30)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                        r.adr_yoy_pct == null
                          ? 'text-slate-400'
                          : r.adr_yoy_pct >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {r.adr_yoy_pct == null
                        ? '—'
                        : `${r.adr_yoy_pct >= 0 ? '+' : ''}${fmt1(r.adr_yoy_pct)}%`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmt(r.revenue_past_30)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                        r.revenue_yoy_pct == null
                          ? 'text-slate-400'
                          : r.revenue_yoy_pct >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {r.revenue_yoy_pct == null
                        ? '—'
                        : `${r.revenue_yoy_pct >= 0 ? '+' : ''}${fmt1(r.revenue_yoy_pct)}%`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(occ)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {fmtPct(mkt)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                        delta == null
                          ? 'text-slate-400'
                          : delta >= 0
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {delta == null
                        ? '—'
                        : `${delta >= 0 ? '+' : ''}${fmt1(delta)}`}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.rec_base_unavailable ? (
                        <span className="text-[11px] text-amber-600">Unavail</span>
                      ) : (
                        fmt(r.recommended_base_price)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="px-6 py-3 text-xs text-slate-500 border-t border-slate-200 flex items-center gap-3">
          <span>
            Sorted by <span className="font-medium">{sort.key}</span> ({sort.dir})
          </span>
          <span className="text-slate-300">·</span>
          <span>USD. Past 30d + forward {horizon}d forecast.</span>
        </footer>
      </div>
    </div>
  );
}

// Client-only trigger that opens the modal. Rendered by the server page
// inline; spawns the modal on click and closes on X / backdrop.
export function BuildingRowTrigger({
  buildingCode,
  horizon,
  units,
  children,
}: {
  buildingCode: string;
  horizon: PricingHorizon;
  units: PricingListingRow[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left hover:bg-slate-50/60 transition cursor-pointer"
        aria-label={`View units in ${buildingCode}`}
      >
        {children}
      </button>
      {open && (
        <BuildingDetailModal
          buildingCode={buildingCode}
          horizon={horizon}
          units={units}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
