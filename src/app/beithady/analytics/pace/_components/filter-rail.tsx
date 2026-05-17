// src/app/beithady/analytics/pace/_components/filter-rail.tsx
'use client';
import { usePaceUrlState } from '../_hooks/use-pace-url-state';
import type { PaceCountry } from '@/lib/pace-report/types';

const COUNTRY_LABEL: Record<PaceCountry, string> = { EG: 'Egypt', AE: 'UAE' };
const COUNTRIES: PaceCountry[] = ['EG', 'AE'];

type Props = {
  cityOptions: string[];
  tagOptions: string[];
};

export function FilterRail({ cityOptions, tagOptions }: Props) {
  const { state, update } = usePaceUrlState();

  const toggleCountry = (c: PaceCountry) => {
    const next = state.filters.countries.includes(c)
      ? state.filters.countries.filter((x) => x !== c)
      : [...state.filters.countries, c];
    update({ filters: { ...state.filters, countries: next } });
  };
  const toggleCity = (city: string) => {
    const next = state.filters.cities.includes(city)
      ? state.filters.cities.filter((x) => x !== city)
      : [...state.filters.cities, city];
    update({ filters: { ...state.filters, cities: next } });
  };
  const toggleTag = (t: string) => {
    const next = state.filters.tags.includes(t)
      ? state.filters.tags.filter((x) => x !== t)
      : [...state.filters.tags, t];
    update({ filters: { ...state.filters, tags: next } });
  };
  const clearAll = () => {
    update({
      filters: {
        countries: [], cities: [], tags: [], listingIds: [],
        includeInactive: false, includeHistorical: false,
      },
    });
  };

  return (
    <aside className="w-[260px] shrink-0 border-l border-[#003462]/10 bg-white/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#6077a6] font-semibold">Filters</span>
        <button
          onClick={clearAll}
          className="text-[10px] text-[#6077a6] hover:text-[#003462] transition motion-reduce:transition-none"
        >
          Reset
        </button>
      </div>

      <Section title="Country">
        <ChipRow
          items={COUNTRIES.map((c) => ({ value: c, label: COUNTRY_LABEL[c] }))}
          selected={state.filters.countries}
          onToggle={(v) => toggleCountry(v as PaceCountry)}
        />
      </Section>

      <Section title="City">
        <ChipRow
          items={cityOptions.map((c) => ({ value: c, label: c }))}
          selected={state.filters.cities}
          onToggle={toggleCity}
        />
      </Section>

      <Section title="Tag">
        <ChipRow
          items={tagOptions.map((t) => ({ value: t, label: t }))}
          selected={state.filters.tags}
          onToggle={toggleTag}
        />
      </Section>

      <Section title="Display">
        <CheckRow
          label="Include inactive listings"
          checked={state.filters.includeInactive}
          onChange={(v) => update({ filters: { ...state.filters, includeInactive: v } })}
        />
        <CheckRow
          label="Include historical (canceled)"
          checked={state.filters.includeHistorical}
          onChange={(v) => update({ filters: { ...state.filters, includeHistorical: v } })}
        />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#6077a6] mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function ChipRow({ items, selected, onToggle }: { items: { value: string; label: string }[]; selected: string[]; onToggle: (v: string) => void }) {
  if (items.length === 0) {
    return <div className="text-[10px] text-[#6077a6]/70 italic">No options</div>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => {
        const active = selected.includes(it.value);
        return (
          <button
            key={it.value}
            onClick={() => onToggle(it.value)}
            className={`px-2 py-0.5 rounded-full text-[10px] transition motion-reduce:transition-none ${
              active
                ? 'bg-[#003462] text-white border border-[#003462]'
                : 'bg-white text-[#003462] border border-[#003462]/20 hover:border-[#003462]/40'
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[#003462] cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[#003462]"
      />
      {label}
    </label>
  );
}
