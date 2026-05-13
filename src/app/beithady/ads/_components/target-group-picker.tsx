'use client';

// Shared target-audience group picker used across all BH Ads campaign wizards.
// Renders 3 cards (Gulf / Europe / North America) — clicking one fills the
// hidden target_countries + target_group_id inputs so the server action gets
// the right ISO codes without the operator having to type anything.

import { useState } from 'react';
import { Globe2, Check } from 'lucide-react';

export type TargetGroup = {
  id: number;
  slug: string;
  name: string;
  region: string;
  countries: string[];
  languages: string[] | null;
  age_min: number;
  age_max: number;
  notes: string | null;
};

// Default groups — callers can override with DB-fetched data.
export const DEFAULT_TARGET_GROUPS: TargetGroup[] = [
  {
    id: 1,
    slug: 'gulf',
    name: 'Gulf',
    region: 'Gulf',
    countries: ['SA', 'AE', 'OM', 'KW', 'JO', 'LB'],
    languages: ['ar'],
    age_min: 23,
    age_max: 54,
    notes: 'SA · AE · OM · KW · JO · LB',
  },
  {
    id: 2,
    slug: 'europe',
    name: 'Europe',
    region: 'Europe',
    countries: ['FR', 'IT', 'NL', 'UA'],
    languages: null,
    age_min: 28,
    age_max: 58,
    notes: 'FR · IT · NL · UA',
  },
  {
    id: 3,
    slug: 'north_america',
    name: 'North America',
    region: 'North America',
    countries: ['CA', 'US'],
    languages: ['ar'],
    age_min: 25,
    age_max: 55,
    notes: 'CA · US',
  },
];

const GROUP_INTERESTS: Record<string, string[]> = {
  gulf:          ['Luxury travel', 'Beach resort', 'Egypt', 'Family vacation', 'Hotel'],
  europe:        ['Egypt', 'Red Sea', 'Beach vacation', 'Cairo', 'Snorkeling'],
  north_america: ['Egypt', 'Arab culture', 'Middle East', 'Eid al-Fitr'],
};

const GROUP_BEHAVIORS: Record<string, string[]> = {
  gulf:          ['Frequent intl. travelers', 'Engaged shoppers'],
  europe:        ['Frequent travelers'],
  north_america: ['Expats', 'Frequent intl. travelers'],
};

const SPENDING_LABEL: Record<string, string | null> = {
  top_25: 'Top 25% spending',
  top_50: 'Top 50% spending',
  all:    null,
};

const GROUP_SPENDING: Record<string, string> = {
  gulf:          'top_50',
  europe:        'all',
  north_america: 'all',
};

const REGION_EMOJI: Record<string, string> = {
  Gulf: '🌍',
  Europe: '🇪🇺',
  'North America': '🌎',
};

type Props = {
  groups?: TargetGroup[];
  /** if pre-selected (e.g. editing an existing campaign) */
  defaultGroupId?: number | null;
};

export function TargetGroupPicker({ groups = DEFAULT_TARGET_GROUPS, defaultGroupId }: Props) {
  const [selected, setSelected] = useState<number | null>(defaultGroupId ?? null);

  const active = groups.find(g => g.id === selected);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <Globe2 size={13} />
        Target audience group
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {groups.map(g => {
          const isActive = selected === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelected(isActive ? null : g.id)}
              className={`relative text-left rounded-lg border px-3 py-2.5 transition-all ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 ring-1 ring-emerald-400'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400'
              }`}
            >
              {isActive && (
                <span className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-0.5">
                  <Check size={9} />
                </span>
              )}
              <div className="text-base mb-0.5">{REGION_EMOJI[g.region] ?? '🌐'}</div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{g.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{g.notes}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                Age {g.age_min}–{g.age_max}
              </div>

              {/* Interests */}
              {GROUP_INTERESTS[g.slug] && (
                <div className="mt-1.5 flex flex-wrap gap-0.5">
                  {GROUP_INTERESTS[g.slug].map(i => (
                    <span key={i} className="text-[9px] bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded px-1 py-0.5">{i}</span>
                  ))}
                </div>
              )}

              {/* Behaviors + spending + language */}
              <div className="mt-1 flex flex-wrap gap-0.5">
                {GROUP_BEHAVIORS[g.slug]?.map(b => (
                  <span key={b} className="text-[9px] bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded px-1 py-0.5">{b}</span>
                ))}
                {SPENDING_LABEL[GROUP_SPENDING[g.slug] || 'all'] && (
                  <span className="text-[9px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded px-1 py-0.5">
                    {SPENDING_LABEL[GROUP_SPENDING[g.slug]]}
                  </span>
                )}
                {g.languages?.includes('ar') && (
                  <span className="text-[9px] bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded px-1 py-0.5">Arabic only</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Hidden inputs read by the server action */}
      <input type="hidden" name="target_group_id" value={active?.id ?? ''} />
      <input
        type="hidden"
        name="target_countries"
        value={active ? active.countries.join(',') : ''}
      />
      <input
        type="hidden"
        name="target_languages"
        value={active?.languages?.join(',') ?? ''}
      />
      <input type="hidden" name="age_min" value={active?.age_min ?? 25} />
      <input type="hidden" name="age_max" value={active?.age_max ?? 55} />

      {!active && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Select a target group above — or the campaign will use the defaults from the form below.
        </p>
      )}
    </div>
  );
}
