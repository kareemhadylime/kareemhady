'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import type { CalendarFilters } from '@/lib/beithady/operations/types';

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'] as const;
const CHANNELS = [
  { value: 'airbnb2', label: 'Airbnb' },
  { value: 'bookingCom', label: 'Booking.com' },
  { value: 'manual', label: 'Direct' },
  { value: 'hopper', label: 'Hopper' },
];

export function HeaderBar({
  startDate,
  daysCount,
  filters,
}: {
  startDate: string;        // YYYY-MM-DD
  daysCount: number;
  filters: CalendarFilters;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const updateParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(sp?.toString() || '');
    if (!value || value === 'all' || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`?${next.toString()}`);
  };

  const shiftDays = (delta: number) => {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    updateParam('from', d.toISOString().slice(0, 10));
  };

  const today = () => updateParam('from', new Date().toISOString().slice(0, 10));

  const buildingsCsv = (filters.buildings || []).join(',');
  const channelsCsv = (filters.channels || []).join(',');

  return (
    <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
      {/* Date navigation */}
      <button
        type="button"
        onClick={() => shiftDays(-daysCount)}
        className="ix-btn-secondary !p-1.5"
        aria-label="Previous"
      >
        <ChevronLeft size={14} />
      </button>
      <button type="button" onClick={today} className="ix-btn-secondary !text-xs">
        <CalIcon size={12} /> Today
      </button>
      <button
        type="button"
        onClick={() => shiftDays(daysCount)}
        className="ix-btn-secondary !p-1.5"
        aria-label="Next"
      >
        <ChevronRight size={14} />
      </button>
      <input
        type="date"
        value={startDate}
        onChange={e => updateParam('from', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
      />

      <div className="w-px h-5 bg-slate-300 dark:bg-slate-700 mx-1" />

      {/* View span */}
      <select
        value={String(daysCount)}
        onChange={e => updateParam('days', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
        aria-label="Days to show"
      >
        <option value="7">7 days</option>
        <option value="14">14 days</option>
        <option value="28">28 days</option>
      </select>

      {/* Buildings */}
      <select
        value={buildingsCsv}
        onChange={e => updateParam('buildings', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
        aria-label="Buildings"
      >
        <option value="">All buildings</option>
        {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
      </select>

      {/* Channels */}
      <select
        value={channelsCsv}
        onChange={e => updateParam('channels', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
        aria-label="Channels"
      >
        <option value="">All channels</option>
        {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>

      {/* Status */}
      <select
        value={filters.statusFilter || 'all'}
        onChange={e => updateParam('status', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
        aria-label="Status"
      >
        <option value="all">All status</option>
        <option value="confirmed">Confirmed</option>
        <option value="inquiry">Inquiry</option>
        <option value="canceled">Canceled</option>
      </select>

      {/* Risk filter */}
      <select
        value={filters.riskFilter || 'all'}
        onChange={e => updateParam('risk', e.target.value)}
        className="ix-input !text-xs !py-1 !px-2"
        aria-label="Risk filter"
      >
        <option value="all">All risk</option>
        <option value="unpaid">Unpaid</option>
        <option value="prearrival_missing">Pre-arrival pending</option>
        <option value="vip">VIP only</option>
      </select>

      {/* Search */}
      <input
        type="search"
        placeholder="Search guest / listing / Res #"
        defaultValue={filters.search || ''}
        onChange={e => {
          // Debounce via single-shot timeout
          clearTimeout((window as unknown as { _qTimeout?: number })._qTimeout);
          (window as unknown as { _qTimeout?: number })._qTimeout = window.setTimeout(() => {
            updateParam('q', e.target.value || undefined);
          }, 350);
        }}
        className="ix-input !text-xs !py-1 !px-2 ml-auto w-48"
      />
    </section>
  );
}
