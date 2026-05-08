'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ListingMeta, FeeBreakdown } from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import { CHANNEL_LABEL, CHANNEL_COLOR } from '@/lib/beithady/reports/channel-taxonomy';

const fmt = (v: number | null | undefined): string =>
  v == null ? 'â€”' : `$${Number(v).toFixed(2)}`;

export function ChannelCompareModal({
  listingId,
  listing,
  dateIso,
  onClose,
}: {
  listingId: string;
  listing: ListingMeta | null;
  dateIso: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Array<{ channel: ChannelBucket; breakdown: FeeBreakdown }> | null>(null);
  const [nights, setNights] = useState(3);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/beithady/fees-audit/compare/${listingId}?date=${dateIso}&nights=${nights}&guests=${listing?.capacity || 2}`)
      .then(r => r.json())
      .then(j => setData(j.channels || null))
      .finally(() => setLoading(false));
  }, [listingId, dateIso, nights, listing?.capacity]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="bg-[var(--bh-ink)] text-white px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-amber-200">
              Channel Comparison
            </p>
            <h2 className="text-lg font-bold">{listing?.nickname || listingId}</h2>
            <p className="text-xs text-slate-300">
              {dateIso} Â· {nights} nights Â· {listing?.capacity || 2} guests
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={nights}
              onChange={e => setNights(Number(e.target.value))}
              min={1}
              max={365}
              className="w-16 rounded text-slate-900 px-2 py-1 text-xs"
            />
            <button onClick={onClose} className="text-white/70 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </header>

        <main className="p-5">
          {loading ? (
            <div className="text-center text-sm text-slate-500 py-12">
              <Loader2 className="inline animate-spin" size={20} />
              <span className="ml-2">Comparing channelsâ€¦</span>
            </div>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-2 font-semibold">Fee component</th>
                    {data.map(c => (
                      <th
                        key={c.channel}
                        className="text-right py-2 px-2 font-semibold"
                        style={{ color: CHANNEL_COLOR[c.channel] }}
                      >
                        {CHANNEL_LABEL[c.channel]}
                      </th>
                    ))}
                    <th className="text-right py-2 px-2 font-semibold text-slate-500">Î”% minâ†”max</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Base rate', key: (b: FeeBreakdown) => b.base_rate_total_usd },
                    { label: 'Cleaning', key: (b: FeeBreakdown) => b.cleaning_usd },
                    { label: 'Taxes', key: (b: FeeBreakdown) => b.taxes_usd },
                    { label: 'Channel commission', key: (b: FeeBreakdown) => b.channel_commission_usd },
                    { label: 'Guest service fee', key: (b: FeeBreakdown) => b.guest_service_fee_usd },
                  ].map(row => {
                    const vals = data.map(c => row.key(c.breakdown));
                    const min = Math.min(...vals);
                    const max = Math.max(...vals);
                    const dpct = min > 0 ? ((max - min) / min) * 100 : 0;
                    return (
                      <tr key={row.label} className="border-b border-slate-100">
                        <td className="py-1.5 px-2 text-slate-600">{row.label}</td>
                        {data.map((c, i) => (
                          <td key={c.channel} className="py-1.5 px-2 text-right tabular-nums">
                            {fmt(vals[i])}
                          </td>
                        ))}
                        <td className={`py-1.5 px-2 text-right tabular-nums ${dpct > 50 ? 'text-rose-600 font-bold' : dpct > 15 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {dpct > 0 ? `${dpct.toFixed(1)}%` : 'â€”'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-slate-200 font-bold">
                    <td className="py-2 px-2">Guest pays total</td>
                    {data.map(c => (
                      <td key={c.channel} className="py-2 px-2 text-right tabular-nums text-emerald-700">
                        {fmt(c.breakdown.total_guest_pays_usd)}
                      </td>
                    ))}
                    <td className="py-2 px-2 text-right">
                      {(() => {
                        const vals = data.map(c => c.breakdown.total_guest_pays_usd);
                        const min = Math.min(...vals);
                        const max = Math.max(...vals);
                        const dpct = min > 0 ? ((max - min) / min) * 100 : 0;
                        return (
                          <span className={dpct > 50 ? 'text-rose-600' : dpct > 15 ? 'text-amber-600' : 'text-emerald-600'}>
                            {dpct.toFixed(1)}%
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="py-2 px-2">Host receives total</td>
                    {data.map(c => (
                      <td key={c.channel} className="py-2 px-2 text-right tabular-nums text-[var(--bh-ink)] dark:text-amber-100">
                        {fmt(c.breakdown.total_host_receives_usd)}
                      </td>
                    ))}
                    <td />
                  </tr>
                  <tr>
                    <td className="py-1.5 px-2 text-slate-500">Min stay</td>
                    {data.map(c => (
                      <td key={c.channel} className="py-1.5 px-2 text-right">
                        {c.breakdown.min_nights_required ?? 'â€”'}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
