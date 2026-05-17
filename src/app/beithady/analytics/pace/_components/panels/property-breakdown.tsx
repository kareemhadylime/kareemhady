'use client';
import { useState } from 'react';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import { TabStrip } from '../tab-strip';
import type { CityRow, PropertyRow } from '@/lib/pace-report/types';

type Mode = 'by-property' | 'by-city';

const MODE_TABS: { value: Mode; label: string }[] = [
  { value: 'by-property', label: 'By Property' },
  { value: 'by-city', label: 'By City' },
];

type Props = {
  byProperty: PropertyRow[];
  byCity: CityRow[];
};

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtPct(n: number): string {
  return `${Math.round(n)}%`;
}
function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function PropertyBreakdown({ byProperty, byCity }: Props) {
  const [mode, setMode] = useState<Mode>('by-property');

  return (
    <PanelFrame label="🏢 Property breakdown">
      <div className="mb-3">
        <TabStrip tabs={MODE_TABS} value={mode} onChange={setMode} ariaLabel="Breakdown grouping" />
      </div>
      <div className="overflow-x-auto">
        {mode === 'by-property' ? (
          <PropertyTable rows={byProperty} />
        ) : (
          <CityTable rows={byCity} />
        )}
      </div>
    </PanelFrame>
  );
}

function PropertyTable({ rows }: { rows: PropertyRow[] }) {
  const grand = rows.reduce(
    (acc, r) => ({
      revenue_usd: acc.revenue_usd + r.revenue_usd,
      booked_days: acc.booked_days + r.booked_days,
      bookable_days: acc.bookable_days + r.bookable_days,
      available_days: acc.available_days + r.available_days,
    }),
    { revenue_usd: 0, booked_days: 0, bookable_days: 0, available_days: 0 },
  );
  const occ = grand.bookable_days > 0 ? (grand.booked_days / grand.bookable_days) * 100 : 0;
  const anr = grand.booked_days > 0 ? grand.revenue_usd / grand.booked_days : 0;
  const revpar = grand.bookable_days > 0 ? grand.revenue_usd / grand.bookable_days : 0;

  return (
    <table className="w-full text-xs">
      <thead>
        <Th cols={['Listing Nickname', 'Unit Type', 'Revenue', 'Booked Days', 'Reserved Days', 'Bookable Days', 'Available Days', 'Occupancy', 'ANR', 'RevPAR']} />
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.listing_id} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
            <td className="px-2 py-1.5 text-[#003462]">{r.nickname}</td>
            <td className="px-2 py-1.5 text-[#6077a6]">{r.unit_type}</td>
            <Num value={fmtMoney(r.revenue_usd)} />
            <Num value={fmtNum(r.booked_days)} />
            <Num value={r.reserved_days || ''} muted />
            <Num value={fmtNum(r.bookable_days)} />
            <Num value={fmtNum(r.available_days)} />
            <Num value={fmtPct(r.occupancy_pct)} />
            <Num value={fmtNum(r.anr_usd)} />
            <Num value={fmtNum(r.revpar_usd)} />
          </tr>
        ))}
        <tr className="border-t border-[#003462]/20 font-semibold">
          <td className="px-2 py-1.5 text-[#003462]" colSpan={2}>Grand Total</td>
          <Num value={fmtMoney(grand.revenue_usd)} />
          <Num value={fmtNum(grand.booked_days)} />
          <Num value="" muted />
          <Num value={fmtNum(grand.bookable_days)} />
          <Num value={fmtNum(grand.available_days)} />
          <Num value={fmtPct(occ)} />
          <Num value={fmtNum(anr)} />
          <Num value={fmtNum(revpar)} />
        </tr>
      </tbody>
    </table>
  );
}

function CityTable({ rows }: { rows: CityRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <Th cols={['City', 'Units', 'Revenue', 'Booked Days', 'Reserved Days', 'Bookable Days', 'Available Days', 'Occupancy', 'ANR', 'RevPAR']} />
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.city} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
            <td className="px-2 py-1.5 text-[#003462]">{r.city}{r.country ? ` · ${r.country}` : ''}</td>
            <Num value={fmtNum(r.unit_count)} />
            <Num value={fmtMoney(r.revenue_usd)} />
            <Num value={fmtNum(r.booked_days)} />
            <Num value={r.reserved_days || ''} muted />
            <Num value={fmtNum(r.bookable_days)} />
            <Num value={fmtNum(r.available_days)} />
            <Num value={fmtPct(r.occupancy_pct)} />
            <Num value={fmtNum(r.anr_usd)} />
            <Num value={fmtNum(r.revpar_usd)} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ cols }: { cols: string[] }) {
  return (
    <tr className="border-b border-[#003462]/10">
      {cols.map((c, i) => (
        <th
          key={c}
          className={`px-2 py-2 font-semibold text-[#6077a6] ${i <= 1 ? 'text-left' : 'text-right'}`}
        >
          {c}
        </th>
      ))}
    </tr>
  );
}

function Num({ value, muted = false }: { value: string | number; muted?: boolean }) {
  return (
    <td className={`px-2 py-1.5 text-right tabular-nums ${muted ? 'text-[#6077a6]' : 'text-[#003462]'}`}>
      {value}
    </td>
  );
}
