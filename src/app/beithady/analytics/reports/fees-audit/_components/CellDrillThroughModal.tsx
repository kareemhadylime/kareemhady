'use client';

import { X, ExternalLink } from 'lucide-react';
import type { DailyCell, ListingMeta } from '@/lib/beithady/fees-audit/types';
import { CHANNEL_LABEL } from '@/lib/beithady/reports/channel-taxonomy';

const fmt = (v: number | null | undefined): string =>
  v == null ? '—' : `$${Number(v).toFixed(2)}`;

export function CellDrillThroughModal({
  cell,
  listing,
  onClose,
}: {
  cell: DailyCell;
  listing: ListingMeta | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-[#1e3a5f] text-white px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-amber-200">
              Fee Breakdown
            </p>
            <h2 className="text-lg font-bold">
              {listing?.nickname || cell.listing_id}
            </h2>
            <p className="text-xs text-slate-300">
              {cell.date} · {listing?.building} · {listing?.bedrooms} BR / {listing?.bathrooms ?? '—'} BA
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </header>

        <main className="p-5 space-y-5">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Base rate this day
            </h3>
            <div className="text-3xl font-bold text-[#1e3a5f] dark:text-amber-100 tabular-nums">
              {fmt(cell.base_price_usd)}
            </div>
            {cell.is_weekend && (
              <span className="text-xs inline-block mt-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Weekend
              </span>
            )}
            {cell.is_blocked && (
              <span className="text-xs inline-block mt-1 ml-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                Blocked
              </span>
            )}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
              Per-channel breakdown (1 night, base capacity)
            </h3>
            <div className="space-y-2">
              {cell.per_channel.map(ch => (
                <div
                  key={ch.channel}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{CHANNEL_LABEL[ch.channel]}</span>
                    <span className="text-xs text-slate-500">
                      Guest: <span className="font-bold text-emerald-700">{fmt(ch.guest_gross_usd)}</span> ·
                      Host: <span className="font-bold text-[#1e3a5f] dark:text-amber-100">{fmt(ch.host_net_usd)}</span>
                    </span>
                  </div>
                  <table className="w-full text-[11px]">
                    <tbody>
                      <Row label="Base" value={fmt(ch.breakdown.base_rate_total_usd)} />
                      <Row label="Cleaning" value={fmt(ch.breakdown.cleaning_usd)} />
                      {/* Guesty prices are all-inclusive — taxes_breakdown is
                          empty by design now. Kept the .map for forward
                          compatibility with any future per-channel surcharge. */}
                      {ch.breakdown.taxes_breakdown.map(t => (
                        <Row key={t.type} label={t.type} value={fmt(t.amount_usd)} />
                      ))}
                      {ch.breakdown.channel_commission_usd > 0 && (
                        <Row
                          label="Channel commission"
                          value={`(${fmt(ch.breakdown.channel_commission_usd)})`}
                        />
                      )}
                      {ch.breakdown.guest_service_fee_usd > 0 && (
                        <Row label="Guest service fee" value={fmt(ch.breakdown.guest_service_fee_usd)} />
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {listing && (
            <section className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <a
                href={`/beithady/pricing?listing=${listing.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e3a5f] dark:text-amber-100 hover:underline"
              >
                Go to listing detail <ExternalLink size={12} />
              </a>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-0.5 text-slate-600 dark:text-slate-400">{label}</td>
      <td className="py-0.5 text-right tabular-nums font-medium">{value}</td>
    </tr>
  );
}
