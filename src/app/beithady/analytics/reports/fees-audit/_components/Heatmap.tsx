'use client';

import type { FeeAuditData, FeeCategory } from '@/lib/beithady/fees-audit/types';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';

export function Heatmap({
  data,
  category,
  onCellClick,
}: {
  data: FeeAuditData;
  category: FeeCategory;
  onCellClick: (listingId: string, date: string) => void;
}) {
  const dates = Array.from(new Set(data.daily.map(d => d.date))).sort();
  const listings = data.listings.slice().sort((a, b) => {
    if (a.building !== b.building) return a.building.localeCompare(b.building);
    if (a.bedrooms !== b.bedrooms) return a.bedrooms - b.bedrooms;
    return a.nickname.localeCompare(b.nickname);
  });

  // Compute the value to display per cell based on selected category.
  function valueOf(listingId: string, date: string): number | null {
    const cell = data.daily.find(d => d.listing_id === listingId && d.date === date);
    if (!cell) return null;
    const lst = data.listings.find(l => l.id === listingId);
    switch (category) {
      case 'daily_rate':
        return cell.base_price_usd;
      case 'weekend_uplift':
        return cell.is_weekend ? cell.base_price_usd : null;
      case 'cleaning':
        return lst?.cleaning_fee ?? null;
      case 'service':
        return cell.per_channel[0]?.breakdown.guest_service_fee_usd ?? null;
      case 'pet':
        return lst?.pet_fee ?? null;
      case 'extra_guest':
        return lst?.extra_guest_fee ?? null;
      case 'security_deposit':
        return lst?.security_deposit ?? null;
      case 'vat':
        return cell.per_channel[0]?.breakdown.taxes_breakdown.find(t => /vat/i.test(t.type))?.amount_usd ?? null;
      case 'occupancy_tax':
        return cell.per_channel[0]?.breakdown.taxes_breakdown.find(t => /occupancy|tourism/i.test(t.type))?.amount_usd ?? null;
      case 'service_charge':
        return cell.per_channel[0]?.breakdown.taxes_breakdown.find(t => /service/i.test(t.type))?.amount_usd ?? null;
      case 'total_tax_burden':
        return cell.per_channel[0]?.breakdown.taxes_usd ?? null;
      case 'channel_commission':
        return cell.per_channel[0]?.breakdown.channel_commission_usd ?? null;
      case 'guest_service_fee':
        return cell.per_channel[0]?.breakdown.guest_service_fee_usd ?? null;
      case 'min_stay':
        return cell.per_channel[0]?.breakdown.min_nights_required ?? null;
      case 'weekly_discount':
        return cell.weekly_discount_pct ?? null;
      case 'monthly_discount':
        return cell.monthly_discount_pct ?? null;
      case 'last_minute_discount':
        return cell.last_minute_discount_pct ?? null;
      default:
        return cell.base_price_usd;
    }
  }

  // Color scale
  const allVals = listings.flatMap(l => dates.map(d => valueOf(l.id, d)).filter((v): v is number => v != null));
  const max = allVals.length ? Math.max(...allVals) : 1;
  const min = allVals.length ? Math.min(...allVals) : 0;

  function colorFor(v: number | null): string {
    if (v == null) return '#f1f5f9';
    if (max === min) return '#e0f2fe';
    const t = (v - min) / (max - min);
    const r = Math.round(34 + (191 - 34) * t);
    const g = Math.round(197 - (197 - 36) * t);
    const b = Math.round(94 - (94 - 36) * t);
    return `rgb(${r},${g},${b})`;
  }

  function fmt(v: number | null): string {
    if (v == null) return '—';
    if (category.includes('discount')) return `${v.toFixed(1)}%`;
    if (category === 'min_stay' || category === 'max_stay') return v.toFixed(0);
    if (v < 1 && v > 0) return v.toFixed(2);
    return `$${Math.round(v).toLocaleString()}`;
  }

  return (
    <div className="ix-card p-4">
      <h3 className="text-sm font-semibold text-[#1e3a5f] dark:text-amber-100 mb-3">
        Heatmap · {FEE_CATEGORY_LABEL[category]}
      </h3>
      {dates.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No forward calendar data — run sync first.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white dark:bg-slate-900 px-3 py-2 text-left font-semibold border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                  Listing
                </th>
                {dates.map(d => (
                  <th
                    key={d}
                    className="px-2 py-2 text-center font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-slate-700 dark:text-slate-200"
                  >
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listings.map(l => (
                <tr key={l.id}>
                  <td className="sticky left-0 bg-white dark:bg-slate-900 px-3 py-1.5 font-medium whitespace-nowrap text-slate-700 dark:text-slate-200">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
                      {l.building}
                    </span>
                    <span>{l.nickname}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5">
                      {l.bedrooms}BR
                    </span>
                  </td>
                  {dates.map(d => {
                    const v = valueOf(l.id, d);
                    return (
                      <td
                        key={d}
                        onClick={() => onCellClick(l.id, d)}
                        style={{ background: colorFor(v) }}
                        className="px-2 py-1.5 text-center cursor-pointer text-white tabular-nums font-medium hover:ring-2 hover:ring-amber-400 transition"
                        title={`${l.nickname} · ${d} · ${fmt(v)}`}
                      >
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
