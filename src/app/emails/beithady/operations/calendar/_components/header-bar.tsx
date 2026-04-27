'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Search } from 'lucide-react';
import type { CalendarFilters } from '@/lib/beithady/operations/types';

const BUILDINGS = [
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
] as const;

const CHANNELS = [
  { value: 'airbnb2', label: 'Airbnb', color: '#FF5A5F' },
  { value: 'bookingCom', label: 'Booking.com', color: '#003580' },
  { value: 'manual', label: 'Direct', color: '#0F766E' },
  { value: 'hopper', label: 'Hopper', color: '#7B61FF' },
] as const;

const COUNTRIES = [
  { value: 'Egypt', label: 'Egypt', flag: '🇪🇬' },
  { value: 'United Arab Emirates', label: 'UAE', flag: '🇦🇪' },
] as const;

const STATUSES = [
  { value: 'confirmed', label: 'Confirmed', color: 'emerald' },
  { value: 'inquiry', label: 'Inquiry', color: 'amber' },
  { value: 'canceled', label: 'Canceled', color: 'slate' },
] as const;

const RISKS = [
  { value: 'unpaid', label: 'Unpaid', color: 'rose' },
  { value: 'prearrival_missing', label: 'Pre-arrival pending', color: 'amber' },
  { value: 'vip', label: 'VIP', color: 'violet' },
] as const;

const SPANS = [7, 14, 28] as const;
const DENSITIES = [
  { value: 'price', label: 'Price' },
  { value: 'occupancy', label: 'Occ %' },
  { value: 'adr', label: 'ADR' },
  { value: 'revenue', label: 'Revenue' },
] as const;

export function HeaderBar({
  startDate,
  daysCount,
  filters,
}: {
  startDate: string;
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

  const currentBuildings = filters.buildings || [];
  const currentChannels = filters.channels || [];
  const currentCountries = filters.countries || [];

  return (
    <section className="ix-card p-3 space-y-2 text-xs">
      {/* Row 1: date navigation */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/50 text-slate-500">
          <Search size={11} />
          <input
            type="search"
            placeholder="Search guest / listing / Res #"
            defaultValue={filters.search || ''}
            onChange={e => {
              clearTimeout((window as unknown as { _qTimeout?: number })._qTimeout);
              (window as unknown as { _qTimeout?: number })._qTimeout = window.setTimeout(() => {
                updateParam('q', e.target.value || undefined);
              }, 350);
            }}
            className="bg-transparent border-0 outline-none text-xs w-44"
          />
        </div>
      </div>

      {/* Row 2: span + density */}
      <FilterRow label="View">
        {SPANS.map(s => (
          <Chip
            key={s}
            active={daysCount === s}
            onClick={() => updateParam('days', String(s))}
            tone="navy"
          >
            {s} days
          </Chip>
        ))}
        <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
        {DENSITIES.map(d => (
          <Chip
            key={d.value}
            active={(sp?.get('density') || 'price') === d.value}
            onClick={() => updateParam('density', d.value === 'price' ? undefined : d.value)}
            tone="cyan"
          >
            {d.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Row 3: buildings */}
      <FilterRow label="Buildings">
        <Chip
          active={currentBuildings.length === 0}
          onClick={() => updateParam('buildings', undefined)}
          tone="navy"
        >
          All
        </Chip>
        {BUILDINGS.map(b => (
          <Chip
            key={b.value}
            active={currentBuildings.includes(b.value)}
            onClick={() => updateParam('buildings', b.value)}
            tone="navy"
          >
            {b.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Row 4: channels */}
      <FilterRow label="Channels">
        <Chip
          active={currentChannels.length === 0}
          onClick={() => updateParam('channels', undefined)}
          tone="cyan"
        >
          All
        </Chip>
        {CHANNELS.map(c => (
          <Chip
            key={c.value}
            active={currentChannels.includes(c.value)}
            onClick={() => updateParam('channels', c.value)}
            customColor={c.color}
          >
            {c.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Row 5: countries */}
      <FilterRow label="Country">
        <Chip
          active={currentCountries.length === 0}
          onClick={() => updateParam('country', undefined)}
          tone="emerald"
        >
          All
        </Chip>
        {COUNTRIES.map(c => (
          <Chip
            key={c.value}
            active={currentCountries.includes(c.value)}
            onClick={() => updateParam('country', c.value)}
            tone="emerald"
          >
            <span>{c.flag}</span> {c.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Row 6: status */}
      <FilterRow label="Status">
        <Chip
          active={!filters.statusFilter || filters.statusFilter === 'all'}
          onClick={() => updateParam('status', undefined)}
          tone="navy"
        >
          Active
        </Chip>
        {STATUSES.map(s => (
          <Chip
            key={s.value}
            active={filters.statusFilter === s.value}
            onClick={() => updateParam('status', s.value)}
            tone={s.color as 'emerald' | 'amber' | 'slate'}
          >
            {s.label}
          </Chip>
        ))}
      </FilterRow>

      {/* Row 7: risk */}
      <FilterRow label="Risk">
        <Chip
          active={!filters.riskFilter || filters.riskFilter === 'all'}
          onClick={() => updateParam('risk', undefined)}
          tone="navy"
        >
          All
        </Chip>
        {RISKS.map(r => (
          <Chip
            key={r.value}
            active={filters.riskFilter === r.value}
            onClick={() => updateParam('risk', r.value)}
            tone={r.color as 'rose' | 'amber' | 'violet'}
          >
            {r.label}
          </Chip>
        ))}
      </FilterRow>
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 w-16 shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

type Tone = 'navy' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

const TONE_ACTIVE: Record<Tone, string> = {
  navy:    'bg-[var(--bh-navy)] text-white border-[var(--bh-navy)]',
  cyan:    'bg-cyan-600 text-white border-cyan-600',
  emerald: 'bg-emerald-600 text-white border-emerald-600',
  amber:   'bg-amber-500 text-white border-amber-500',
  rose:    'bg-rose-600 text-white border-rose-600',
  violet:  'bg-violet-600 text-white border-violet-600',
  slate:   'bg-slate-600 text-white border-slate-600',
};

function Chip({
  active,
  onClick,
  tone = 'navy',
  customColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone?: Tone;
  customColor?: string;
  children: React.ReactNode;
}) {
  const inactive = 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800';
  const cls = active
    ? customColor
      ? 'text-white border'
      : TONE_ACTIVE[tone]
    : inactive;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 transition ${cls}`}
      style={active && customColor ? { background: customColor, borderColor: customColor } : undefined}
    >
      {children}
    </button>
  );
}
