'use client';

import { useEffect, useState } from 'react';
import { Calculator, Loader2 } from 'lucide-react';
import type { ListingMeta, FeeBreakdown } from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';

const CHANNELS: { key: ChannelBucket; label: string }[] = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'booking_com', label: 'Booking.com' },
  { key: 'other_ota', label: 'Other OTA' },
  { key: 'manual', label: 'Manual' },
];

export function QuoteCalculator({ listings }: { listings: ListingMeta[] }) {
  const [listingId, setListingId] = useState<string>(listings[0]?.id || '');
  const [channel, setChannel] = useState<ChannelBucket>('airbnb');
  const [nights, setNights] = useState(3);
  const [guests, setGuests] = useState(2);
  const [dateIso, setDateIso] = useState(new Date().toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/beithady/fees-audit/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listingId, channel, nights, guests, dateIso }),
        });
        const json = (await res.json()) as { breakdown?: FeeBreakdown };
        setBreakdown(json.breakdown || null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [listingId, channel, nights, guests, dateIso]);

  const fmt = (v: number): string => `$${v.toFixed(2)}`;

  return (
    <div className="ix-card p-4">
      <h3 className="text-sm font-semibold text-[var(--bh-ink)] dark:text-amber-100 mb-3 flex items-center gap-2">
        <Calculator size={16} className="text-violet-600" />
        Live Quote Calculator
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
        <Field label="Listing">
          <select
            value={listingId}
            onChange={e => setListingId(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          >
            {listings.map(l => (
              <option key={l.id} value={l.id}>
                {l.nickname} Â· {l.bedrooms}BR
              </option>
            ))}
          </select>
        </Field>
        <Field label="Channel">
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as ChannelBucket)}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          >
            {CHANNELS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Check-in date">
          <input
            type="date"
            value={dateIso}
            onChange={e => setDateIso(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </Field>
        <Field label="Nights">
          <input
            type="number"
            min={1}
            max={365}
            value={nights}
            onChange={e => setNights(Number(e.target.value))}
            placeholder="Nights"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </Field>
        <Field label="Guests">
          <input
            type="number"
            min={1}
            max={20}
            value={guests}
            onChange={e => setGuests(Number(e.target.value))}
            placeholder="Guests"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
          />
        </Field>
      </div>

      {loading ? (
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Computingâ€¦
        </div>
      ) : breakdown ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-xs">
            <div className="font-bold text-[var(--bh-ink)] dark:text-amber-100 mb-2 uppercase">
              Stay Breakdown
            </div>
            <table className="w-full">
              <tbody>
                <Row label="Base rate" value={fmt(breakdown.base_rate_total_usd)} />
                <Row label="Cleaning fee" value={fmt(breakdown.cleaning_usd)} />
                {breakdown.pet_usd > 0 && <Row label="Pet fee" value={fmt(breakdown.pet_usd)} />}
                {breakdown.extra_guest_usd > 0 && <Row label="Extra guest" value={fmt(breakdown.extra_guest_usd)} />}
                {/* Guesty prices are all-inclusive â€” taxes_breakdown is empty
                    by design. Kept the .map so any future per-channel
                    surcharge surfaces here without a code change. */}
                {breakdown.taxes_breakdown.map(t => (
                  <Row key={t.type} label={t.type} value={fmt(t.amount_usd)} />
                ))}
                {breakdown.channel_commission_usd > 0 && (
                  <Row
                    label={
                      breakdown.channel_commission_label
                        ? `Host service fee (${breakdown.channel_commission_label})`
                        : 'Host service fee'
                    }
                    value={`(${fmt(breakdown.channel_commission_usd)})`}
                  />
                )}
                {breakdown.guest_service_fee_usd > 0 && (
                  <Row label="Guest service fee (channel adds)" value={fmt(breakdown.guest_service_fee_usd)} />
                )}
              </tbody>
            </table>
          </div>
          <div className="text-xs space-y-2">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 border-l-4 border-emerald-600">
              <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Guest Pays (channel page)
              </div>
              <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-100 tabular-nums">
                {fmt(breakdown.total_guest_pays_usd)}
              </div>
            </div>
            <div className="rounded-lg bg-[var(--bh-ink)]/10 p-3 border-l-4 border-[var(--bh-ink)]">
              <div className="text-[10px] uppercase tracking-wide text-[var(--bh-ink)] dark:text-amber-200">
                Host Receives (after commission)
              </div>
              <div className="text-2xl font-bold text-[var(--bh-ink)] dark:text-amber-100 tabular-nums">
                {fmt(breakdown.total_host_receives_usd)}
              </div>
            </div>
            {breakdown.security_deposit_usd > 0 && (
              <div className="text-[10px] text-slate-500">
                Security deposit (refundable): {fmt(breakdown.security_deposit_usd)}
              </div>
            )}
            {breakdown.min_nights_required != null && (
              <div className="text-[10px] text-slate-500">
                Min stay required: {breakdown.min_nights_required} nights
                {nights < breakdown.min_nights_required && (
                  <span className="ml-2 text-rose-600 font-bold">
                    âš  Stay too short!
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-1 text-slate-600 dark:text-slate-300">{label}</td>
      <td className="py-1 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">
        {value}
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}
