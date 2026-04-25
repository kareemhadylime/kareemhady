'use client';

import { useState, useTransition } from 'react';
import { Save, Pencil, X, Lock } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { upsertPricingAction } from '../actions';

// Per-boat pricing row with view/edit toggle. Prices stay locked
// (read-only) once saved; admin clicks "Edit" to unlock the inputs,
// then "Save" or "Cancel" to commit/discard. New boats with no prices
// yet auto-start in edit mode so the admin doesn't have to click Edit
// before entering the first values.

type Boat = { id: string; name: string; status: string };
type Prices = { weekday: number | null; weekend: number | null; season: number | null };

function fmt(n: number | null): string {
  if (n === null) return '—';
  return `EGP ${n.toLocaleString('en-US')}`;
}

export function PricingRow({ boat, prices }: { boat: Boat; prices: Prices }) {
  const allSet = prices.weekday !== null && prices.weekend !== null && prices.season !== null;
  const [mode, setMode] = useState<'view' | 'edit'>(allSet ? 'view' : 'edit');
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  async function onSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await upsertPricingAction(formData);
        toast(`Prices saved for ${boat.name}`, { kind: 'success' });
        hapticSuccess();
        setMode('view');
      } catch {
        toast('Failed to save prices', { kind: 'error' });
        hapticError();
      }
    });
  }

  if (mode === 'view') {
    return (
      <div className="ix-card p-5 relative">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
          <div className="md:col-span-2 flex items-start gap-2">
            <div>
              <div className="font-semibold flex items-center gap-1.5">
                {boat.name}
                <Lock size={12} className="text-slate-400" />
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Status: {boat.status}</div>
            </div>
          </div>
          <PricePill label="Weekday (Sun–Thu)" value={fmt(prices.weekday)} />
          <PricePill label="Weekend (Fri–Sat)" value={fmt(prices.weekend)} />
          <PricePill label="Season / Holiday" value={fmt(prices.season)} />
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="ix-btn-secondary"
          >
            <Pencil size={14} /> Edit prices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ix-card p-5 ring-1 ring-cyan-300/40 dark:ring-cyan-700/40">
      <form action={onSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <input type="hidden" name="boat_id" value={boat.id} />
        <div className="md:col-span-2">
          <div className="font-semibold flex items-center gap-1.5">
            {boat.name}
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
              editing
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Status: {boat.status}</div>
        </div>
        <label className="text-sm">
          <span className="text-slate-600 dark:text-slate-300 text-xs">Weekday (Sun–Thu) EGP</span>
          <input
            name="amount_weekday"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            defaultValue={prices.weekday ?? ''}
            className="ix-input mt-1"
            disabled={pending}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 dark:text-slate-300 text-xs">Weekend (Fri–Sat) EGP</span>
          <input
            name="amount_weekend"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            defaultValue={prices.weekend ?? ''}
            className="ix-input mt-1"
            disabled={pending}
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 dark:text-slate-300 text-xs">Season/Holiday EGP</span>
          <input
            name="amount_season"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            defaultValue={prices.season ?? ''}
            className="ix-input mt-1"
            disabled={pending}
          />
        </label>
        <div className="md:col-span-5 flex justify-end gap-2 flex-wrap">
          {allSet && (
            <button
              type="button"
              onClick={() => setMode('view')}
              disabled={pending}
              className="ix-btn-ghost disabled:opacity-50"
            >
              <X size={14} /> Cancel
            </button>
          )}
          <button type="submit" className="ix-btn-primary disabled:opacity-50" disabled={pending}>
            <Save size={14} />
            {pending ? 'Saving…' : 'Save prices'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PricePill({ label, value }: { label: string; value: string }) {
  const isMissing = value === '—';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      isMissing
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
    }`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
        {label}
      </div>
      <div className={`font-bold tabular-nums text-base ${
        isMissing
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-slate-900 dark:text-slate-100'
      }`}>
        {value}
      </div>
    </div>
  );
}
