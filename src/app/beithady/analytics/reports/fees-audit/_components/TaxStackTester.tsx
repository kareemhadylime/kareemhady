'use client';

import { useEffect, useState } from 'react';
import { X, Calculator, Loader2 } from 'lucide-react';
import type { ListingMeta, FeeBreakdown } from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';

const CHANNELS: ChannelBucket[] = ['airbnb', 'booking_com', 'other_ota', 'manual'];

export function TaxStackTester({
  listings,
  onClose,
}: {
  listings: ListingMeta[];
  onClose: () => void;
}) {
  const [listingId, setListingId] = useState(listings[0]?.id || '');
  const [channel, setChannel] = useState<ChannelBucket>('airbnb');
  const [nights, setNights] = useState(3);
  const [guests, setGuests] = useState(2);
  const [dateIso, setDateIso] = useState(new Date().toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    fetch('/api/beithady/fees-audit/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listingId, channel, nights, guests, dateIso }),
    })
      .then(r => r.json())
      .then(j => setBreakdown(j.breakdown || null))
      .finally(() => setLoading(false));
  }, [listingId, channel, nights, guests, dateIso]);

  const listing = listings.find(l => l.id === listingId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="bg-violet-700 text-white px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-violet-200">
              <Calculator size={11} className="inline mr-1" /> Tax Stack Tester
            </p>
            <h2 className="text-lg font-bold">Verify what fees + taxes apply</h2>
            <p className="text-xs text-violet-200">
              Useful when explaining a guest's bill or auditing channel pre-collection.
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </header>

        <main className="p-5 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <select
              value={listingId}
              onChange={e => setListingId(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700"
            >
              {listings.map(l => (
                <option key={l.id} value={l.id}>
                  {l.nickname} · {l.bedrooms}BR
                </option>
              ))}
            </select>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value as ChannelBucket)}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700"
            >
              {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="date"
              value={dateIso}
              onChange={e => setDateIso(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700"
            />
            <input
              type="number"
              min={1}
              value={nights}
              onChange={e => setNights(Number(e.target.value))}
              placeholder="Nights"
              className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700"
            />
            <input
              type="number"
              min={1}
              value={guests}
              onChange={e => setGuests(Number(e.target.value))}
              placeholder="Guests"
              className="rounded border border-slate-200 px-2 py-1.5 text-xs dark:bg-slate-800 dark:border-slate-700"
            />
          </div>

          {listing && (
            <div className="text-xs space-y-1 p-3 rounded bg-slate-50 dark:bg-slate-800/40">
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                Configured taxes for {listing.nickname}:
              </div>
              {listing.taxes.length === 0 ? (
                <div className="text-rose-600 italic">⚠ No taxes configured for this listing.</div>
              ) : (
                listing.taxes.map((t, i) => (
                  <div key={i} className="text-slate-600 dark:text-slate-400">
                    • {t.type}:{' '}
                    {t.rate_pct != null ? `${t.rate_pct}% of ${t.applies_to || 'accommodation'}` : null}
                    {t.amount != null ? `${t.amount} ${t.amount_currency || ''} flat` : null}
                  </div>
                ))
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center text-sm text-slate-500 py-6">
              <Loader2 className="inline animate-spin" size={18} /> Computing…
            </div>
          ) : breakdown ? (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                Applied tax stack on this stay
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="text-left px-2 py-1.5">Tax</th>
                    <th className="text-right px-2 py-1.5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.taxes_breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-3 text-center text-slate-500 italic">
                        No taxes applied
                      </td>
                    </tr>
                  ) : (
                    breakdown.taxes_breakdown.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1.5">{t.type}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">${t.amount_usd.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="font-bold border-t-2 border-slate-300">
                    <td className="px-2 py-1.5">Total tax</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">${breakdown.taxes_usd.toFixed(2)}</td>
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
