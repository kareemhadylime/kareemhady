'use client';

import { useMemo, useState } from 'react';
import { Swords, FileX, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { FeeAuditData, FeeCategory } from '@/lib/beithady/fees-audit/types';

const fmtUsd = (v: number | null): string =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`;

// Pivot mode: when an Analytic category is selected in the sidebar, the
// cross-ref table sorts listings by the analytic dimension instead of the
// default building → bedrooms grouping. Lets the operator slice the same
// data set different ways without changing the underlying query.
type PivotMode = FeeCategory | null;

type SortKey =
  | 'listing'
  | 'br'
  | 'ba'
  | 'cap'
  | 'avg_daily'
  | 'cleaning'
  | 'pet'
  | 'extra_guest'
  | 'min_stay'
  | 'tax_pct'
  | 'guest3n'
  | 'host3n';

type SortDir = 'asc' | 'desc';

export function CrossRefTable({
  data,
  priceMode,
  pivotMode,
  onCompareChannels,
}: {
  data: FeeAuditData;
  priceMode: 'host_net' | 'guest_gross' | 'both';
  pivotMode?: PivotMode;
  onCompareChannels: (listingId: string) => void;
}) {
  // null sortKey === fall back to default/pivot-mode ordering
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Build per-listing derived metrics once so sort/render share the same numbers.
  const rows = useMemo(() => {
    return data.listings.map(l => {
      const days = data.daily.filter(d => d.listing_id === l.id);
      const avgDaily = avg(days.map(d => d.base_price_usd));
      const taxPct = l.taxes
        .filter(t => typeof t.rate_pct === 'number')
        .reduce((s, t) => s + (t.rate_pct || 0), 0);
      const firstCell = days[0];
      const firstCh = firstCell?.per_channel[0];
      const guest3n = firstCh && avgDaily != null
        ? avgDaily * 3 + (l.cleaning_fee || 0) + firstCh.breakdown.taxes_usd + firstCh.breakdown.guest_service_fee_usd
        : null;
      const host3n = firstCh && avgDaily != null
        ? avgDaily * 3 + (l.cleaning_fee || 0) - firstCh.breakdown.channel_commission_usd
        : null;
      return { l, avgDaily, taxPct, guest3n, host3n };
    });
  }, [data]);

  const sortedRows = useMemo(() => {
    const arr = rows.slice();

    if (sortKey === null) {
      // Default + analytic pivot ordering
      arr.sort((a, b) => {
        if (pivotMode === 'analytic_bedroom_class') {
          if (a.l.bedrooms !== b.l.bedrooms) return a.l.bedrooms - b.l.bedrooms;
          if (a.l.building !== b.l.building) return a.l.building.localeCompare(b.l.building);
          return a.l.nickname.localeCompare(b.l.nickname);
        }
        if (pivotMode === 'analytic_capacity') {
          if (a.l.capacity !== b.l.capacity) return a.l.capacity - b.l.capacity;
          return a.l.nickname.localeCompare(b.l.nickname);
        }
        // Default + analytic_building + analytic_channel_mix
        if (a.l.building !== b.l.building) return a.l.building.localeCompare(b.l.building);
        if (a.l.bedrooms !== b.l.bedrooms) return a.l.bedrooms - b.l.bedrooms;
        return a.l.nickname.localeCompare(b.l.nickname);
      });
      return arr;
    }

    // User-driven sort
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      // null/undefined always sort to the end regardless of dir
      const aNull = va == null;
      const bNull = vb == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir, pivotMode]);

  const peerMedians = computePeerMedians(data.listings);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      // 1st click: asc, 2nd: desc, 3rd: clear
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortKey(null);
        setSortDir('asc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <div className="ix-card overflow-x-auto">
      <h3 className="text-sm font-semibold text-[#1e3a5f] dark:text-amber-100 px-4 pt-4 mb-2">
        Cross-Reference · listing × bedrooms × bathrooms × fees
        {sortKey && (
          <button
            onClick={() => {
              setSortKey(null);
              setSortDir('asc');
            }}
            className="ml-3 text-[10px] font-normal uppercase tracking-wider text-amber-700 dark:text-amber-300 hover:underline"
            title="Clear custom sort"
          >
            clear sort
          </button>
        )}
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#f0e9d9] text-[#1e3a5f] dark:bg-slate-800 dark:text-amber-100">
            <SortHeader
              label="Listing"
              align="left"
              sortKey="listing"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
              sticky
            />
            <SortHeader
              label="BR"
              align="center"
              sortKey="br"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="BA"
              align="center"
              sortKey="ba"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Cap"
              align="center"
              sortKey="cap"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Avg Daily Rate"
              align="right"
              sortKey="avg_daily"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Cleaning"
              align="right"
              sortKey="cleaning"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Pet Fee"
              align="right"
              sortKey="pet"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Extra Guest"
              align="right"
              sortKey="extra_guest"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Min Stay"
              align="right"
              sortKey="min_stay"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            <SortHeader
              label="Tax %"
              align="right"
              sortKey="tax_pct"
              activeKey={sortKey}
              dir={sortDir}
              onSort={toggleSort}
            />
            {(priceMode === 'guest_gross' || priceMode === 'both') && (
              <SortHeader
                label="Guest 3n"
                align="right"
                sortKey="guest3n"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
            )}
            {(priceMode === 'host_net' || priceMode === 'both') && (
              <SortHeader
                label="Host 3n"
                align="right"
                sortKey="host3n"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
            )}
            <th className="px-2 py-2 text-center font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(({ l, avgDaily, taxPct, guest3n, host3n }) => {
            const cleaningClass = colorForFee(
              l.cleaning_fee,
              peerMedians.cleaning.get(`${l.building}|${l.bedrooms}`)
            );
            return (
              <tr
                key={l.id}
                className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200"
              >
                <td className="px-3 py-1.5 font-medium sticky left-0 bg-white dark:bg-slate-900">
                  {!l.has_full_data && (
                    <span title={l.missing_data_reasons.join(', ')}>
                      <FileX size={11} className="inline text-amber-600 mr-1" />
                    </span>
                  )}
                  {l.nickname}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">
                    {l.building}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">{l.bedrooms}</td>
                <td className="px-2 py-1.5 text-center">{l.bathrooms ?? '—'}</td>
                <td className="px-2 py-1.5 text-center">{l.capacity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(avgDaily)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${cleaningClass}`}>
                  {fmtUsd(l.cleaning_fee)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(l.pet_fee)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtUsd(l.extra_guest_fee)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {l.min_nights_default ?? '—'}
                  {Object.keys(l.min_nights_per_channel).length > 0 && (
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 ml-1">+ch</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {taxPct > 0 ? `${taxPct.toFixed(1)}%` : '—'}
                </td>
                {(priceMode === 'guest_gross' || priceMode === 'both') && (
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">
                    {fmtUsd(guest3n)}
                  </td>
                )}
                {(priceMode === 'host_net' || priceMode === 'both') && (
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#1e3a5f] dark:text-amber-200 font-semibold">
                    {fmtUsd(host3n)}
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => onCompareChannels(l.id)}
                    className="text-amber-600 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-100"
                    title="Compare channels"
                  >
                    <Swords size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  label,
  align,
  sortKey,
  activeKey,
  dir,
  onSort,
  sticky,
}: {
  label: string;
  align: 'left' | 'center' | 'right';
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  sticky?: boolean;
}) {
  const isActive = activeKey === sortKey;
  const alignClass =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
  const stickyClass = sticky ? 'sticky left-0 bg-[#f0e9d9] dark:bg-slate-800' : '';
  return (
    <th
      className={`px-2 py-2 font-semibold ${alignClass} ${stickyClass} cursor-pointer select-none transition hover:bg-[#e6dcc4] dark:hover:bg-slate-700`}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
    >
      <span
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          dir === 'asc' ? (
            <ArrowUp size={10} className="opacity-80" />
          ) : (
            <ArrowDown size={10} className="opacity-80" />
          )
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

function sortValue(
  row: { l: FeeAuditData['listings'][number]; avgDaily: number | null; taxPct: number; guest3n: number | null; host3n: number | null },
  key: SortKey
): string | number | null {
  const { l, avgDaily, taxPct, guest3n, host3n } = row;
  switch (key) {
    case 'listing':
      return l.nickname.toLowerCase();
    case 'br':
      return l.bedrooms;
    case 'ba':
      return l.bathrooms ?? null;
    case 'cap':
      return l.capacity;
    case 'avg_daily':
      return avgDaily;
    case 'cleaning':
      return l.cleaning_fee;
    case 'pet':
      return l.pet_fee;
    case 'extra_guest':
      return l.extra_guest_fee;
    case 'min_stay':
      return l.min_nights_default ?? null;
    case 'tax_pct':
      return taxPct;
    case 'guest3n':
      return guest3n;
    case 'host3n':
      return host3n;
  }
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => n != null && Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function computePeerMedians(listings: Array<{ id: string; bedrooms: number; building: string; cleaning_fee: number | null }>) {
  const cleaningMap = new Map<string, number[]>();
  for (const l of listings) {
    if (l.cleaning_fee == null) continue;
    const k = `${l.building}|${l.bedrooms}`;
    const arr = cleaningMap.get(k) || [];
    arr.push(l.cleaning_fee);
    cleaningMap.set(k, arr);
  }
  const cleaning = new Map<string, number>();
  for (const [k, arr] of cleaningMap) {
    arr.sort((a, b) => a - b);
    cleaning.set(k, arr[Math.floor(arr.length / 2)]);
  }
  return { cleaning };
}

function colorForFee(v: number | null, median: number | undefined): string {
  if (v == null || v === 0) return 'text-rose-700 dark:text-rose-300 font-bold';
  if (median == null || median === 0) return 'text-slate-700 dark:text-slate-200';
  const dev = Math.abs(v - median) / median;
  if (dev > 0.5) return 'text-rose-700 dark:text-rose-300 font-semibold';
  if (dev > 0.15) return 'text-amber-700 dark:text-amber-300';
  return 'text-emerald-700 dark:text-emerald-300';
}
