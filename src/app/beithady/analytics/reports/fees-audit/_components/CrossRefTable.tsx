'use client';

import { Swords, FileX } from 'lucide-react';
import type { FeeAuditData } from '@/lib/beithady/fees-audit/types';

const fmtUsd = (v: number | null): string =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`;

export function CrossRefTable({
  data,
  priceMode,
  onCompareChannels,
}: {
  data: FeeAuditData;
  priceMode: 'host_net' | 'guest_gross' | 'both';
  onCompareChannels: (listingId: string) => void;
}) {
  const listings = data.listings.slice().sort((a, b) => {
    if (a.building !== b.building) return a.building.localeCompare(b.building);
    if (a.bedrooms !== b.bedrooms) return a.bedrooms - b.bedrooms;
    return a.nickname.localeCompare(b.nickname);
  });

  // Compute peer-bedroom medians for outlier highlighting
  const peerMedians = computePeerMedians(listings);

  return (
    <div className="ix-card overflow-x-auto">
      <h3 className="text-sm font-semibold text-[#1e3a5f] dark:text-amber-100 px-4 pt-4 mb-2">
        Cross-Reference · listing × bedrooms × bathrooms × fees
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#f0e9d9] text-[#1e3a5f]">
            <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-[#f0e9d9]">
              Listing
            </th>
            <th className="px-2 py-2 text-center font-semibold">BR</th>
            <th className="px-2 py-2 text-center font-semibold">BA</th>
            <th className="px-2 py-2 text-center font-semibold">Cap</th>
            <th className="px-2 py-2 text-right font-semibold">Avg Daily Rate</th>
            <th className="px-2 py-2 text-right font-semibold">Cleaning</th>
            <th className="px-2 py-2 text-right font-semibold">Pet Fee</th>
            <th className="px-2 py-2 text-right font-semibold">Extra Guest</th>
            <th className="px-2 py-2 text-right font-semibold">Min Stay</th>
            <th className="px-2 py-2 text-right font-semibold">Tax %</th>
            {(priceMode === 'guest_gross' || priceMode === 'both') && (
              <th className="px-2 py-2 text-right font-semibold">Guest 3n</th>
            )}
            {(priceMode === 'host_net' || priceMode === 'both') && (
              <th className="px-2 py-2 text-right font-semibold">Host 3n</th>
            )}
            <th className="px-2 py-2 text-center font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {listings.map(l => {
            const days = data.daily.filter(d => d.listing_id === l.id);
            const avgDaily = avg(days.map(d => d.base_price_usd));
            const cleaningClass = colorForFee(l.cleaning_fee, peerMedians.cleaning.get(`${l.building}|${l.bedrooms}`));
            const taxPct = l.taxes
              .filter(t => typeof t.rate_pct === 'number')
              .reduce((s, t) => s + (t.rate_pct || 0), 0);

            // 3-night example using first day's first channel
            const firstCell = days[0];
            const firstCh = firstCell?.per_channel[0];
            const guest3n = firstCh ? avgDaily ? avgDaily * 3 + (l.cleaning_fee || 0) + firstCh.breakdown.taxes_usd + firstCh.breakdown.guest_service_fee_usd : null : null;
            const host3n = firstCh ? avgDaily ? avgDaily * 3 + (l.cleaning_fee || 0) - firstCh.breakdown.channel_commission_usd : null : null;

            return (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5 font-medium sticky left-0 bg-white dark:bg-slate-900">
                  {!l.has_full_data && (
                    <span title={l.missing_data_reasons.join(', ')}>
                      <FileX size={11} className="inline text-amber-600 mr-1" />
                    </span>
                  )}
                  {l.nickname}
                  <span className="text-[10px] text-slate-400 ml-1">{l.building}</span>
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
                    <span className="text-[9px] text-slate-400 ml-1">+ch</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {taxPct > 0 ? `${taxPct.toFixed(1)}%` : '—'}
                </td>
                {(priceMode === 'guest_gross' || priceMode === 'both') && (
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">
                    {fmtUsd(guest3n)}
                  </td>
                )}
                {(priceMode === 'host_net' || priceMode === 'both') && (
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#1e3a5f] font-semibold">
                    {fmtUsd(host3n)}
                  </td>
                )}
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => onCompareChannels(l.id)}
                    className="text-amber-600 hover:text-amber-800"
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
  if (v == null || v === 0) return 'text-rose-700 font-bold';
  if (median == null || median === 0) return 'text-slate-700';
  const dev = Math.abs(v - median) / median;
  if (dev > 0.5) return 'text-rose-700 font-semibold';
  if (dev > 0.15) return 'text-amber-700';
  return 'text-emerald-700';
}
