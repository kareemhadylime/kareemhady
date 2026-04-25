'use client';

import { useState } from 'react';
import { Check, DollarSign } from 'lucide-react';
import { BOAT_FEATURES } from '@/lib/boat-rental/features';

// Pill-style multi-select for predefined boat features. Two grouped
// sections — "Always Included" (free) and "On Demand · Chargeable"
// (amber). Selected pills get a check + cyan/amber fill. Submits as
// `features` (multiple form values, picked up server-side as
// formData.getAll('features')).

type Props = {
  name?: string;          // form field name (defaults to 'features')
  defaultSelected?: string[];
};

export function FeaturePicker({ name = 'features', defaultSelected = [] }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));
  const toggle = (code: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const always = BOAT_FEATURES.filter(f => f.category === 'always');
  const onDemand = BOAT_FEATURES.filter(f => f.category === 'on_demand');

  return (
    <div className="space-y-4">
      {/* Hidden inputs carry the actual form values — toggling a pill
          mutates the hidden set so a parent <form> picks them up on
          submit without any extra client-side wiring. */}
      {[...selected].map(code => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}

      <fieldset className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-4">
        <legend className="text-[11px] uppercase tracking-wide font-semibold text-cyan-700 dark:text-cyan-300 px-1">
          Always Included
        </legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {always.map(f => {
            const on = selected.has(f.code);
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => toggle(f.code)}
                aria-pressed={on}
                className={
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition select-none ' +
                  (on
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40')
                }
              >
                {on && <Check size={12} />}
                {f.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-4">
        <legend className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-300 px-1 inline-flex items-center gap-1">
          <DollarSign size={11} /> On Demand · Chargeable
        </legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {onDemand.map(f => {
            const on = selected.has(f.code);
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => toggle(f.code)}
                aria-pressed={on}
                className={
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-semibold transition select-none ' +
                  (on
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40')
                }
              >
                {on && <Check size={12} />}
                {f.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-amber-800/80 dark:text-amber-200/70 mt-2">
          Marked as &ldquo;Available on request&rdquo; on the catalogue. Broker quotes price separately.
        </p>
      </fieldset>
    </div>
  );
}
