'use client';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import type { DailyPerfRow } from '@/lib/pace-report/types';

const COLS: { key: keyof DailyPerfRow | 'grand'; label: string; align?: 'right' }[] = [
  { key: 'date', label: 'Date' },
  { key: 'revenue_usd', label: 'Revenue', align: 'right' },
  { key: 'booked_days', label: 'Booked Days', align: 'right' },
  { key: 'reserved_days', label: 'Reserved Days', align: 'right' },
  { key: 'bookable_days', label: 'Bookable Days', align: 'right' },
  { key: 'available_days', label: 'Available Days', align: 'right' },
  { key: 'occupancy_pct', label: 'Occupancy', align: 'right' },
  { key: 'anr_usd', label: 'ANR', align: 'right' },
];

function fmt(v: number, col: typeof COLS[number]['key']): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  if (col === 'revenue_usd') return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (col === 'occupancy_pct') return `${Math.round(v)}%`;
  if (col === 'anr_usd') return Math.round(v).toString();
  return Math.round(v).toString();
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

type Props = { rows: DailyPerfRow[] };

export function DailyPerformance({ rows }: Props) {
  const grand = rows.reduce(
    (acc, r) => ({
      revenue_usd: acc.revenue_usd + r.revenue_usd,
      booked_days: acc.booked_days + r.booked_days,
      reserved_days: acc.reserved_days + r.reserved_days,
      bookable_days: acc.bookable_days + r.bookable_days,
      available_days: acc.available_days + r.available_days,
    }),
    { revenue_usd: 0, booked_days: 0, reserved_days: 0, bookable_days: 0, available_days: 0 },
  );
  const grandOcc = grand.bookable_days > 0 ? (grand.booked_days / grand.bookable_days) * 100 : 0;
  const grandAnr = grand.booked_days > 0 ? grand.revenue_usd / grand.booked_days : 0;

  return (
    <PanelFrame label="📅 Daily Performance">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#003462]/10">
              {COLS.map((c) => (
                <th
                  key={c.key as string}
                  className={`px-2 py-2 font-semibold text-[#6077a6] ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.date} className={i % 2 === 1 ? 'bg-[#003462]/[0.03]' : ''}>
                <td className="px-2 py-1.5 text-[#003462]">{shortDate(r.date)}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.revenue_usd, 'revenue_usd')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.booked_days, 'booked_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#6077a6] tabular-nums">{r.reserved_days || ''}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.bookable_days, 'bookable_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.available_days, 'available_days')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.occupancy_pct, 'occupancy_pct')}</td>
                <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(r.anr_usd, 'anr_usd')}</td>
              </tr>
            ))}
            <tr className="border-t border-[#003462]/20 font-semibold">
              <td className="px-2 py-1.5 text-[#003462]">Grand Total</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.revenue_usd, 'revenue_usd')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.booked_days, 'booked_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#6077a6] tabular-nums">{grand.reserved_days || ''}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.bookable_days, 'bookable_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{fmt(grand.available_days, 'available_days')}</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{Math.round(grandOcc)}%</td>
              <td className="px-2 py-1.5 text-right text-[#003462] tabular-nums">{Math.round(grandAnr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PanelFrame>
  );
}