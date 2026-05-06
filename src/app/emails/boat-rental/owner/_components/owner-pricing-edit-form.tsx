'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, DollarSign, Edit2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { upsertOwnerBoatPricingAction } from '../actions';

type Pricing = { weekday: number; weekend: number; season: number };
type Phase = 'idle' | 'editing' | 'confirming' | 'saving';

export function OwnerPricingEditForm({
  boatId,
  boatName,
  initialPricing,
}: {
  boatId: string;
  boatName: string;
  initialPricing: Pricing;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<Pricing>(initialPricing);

  const numWeekday = Number(draft.weekday);
  const numWeekend = Number(draft.weekend);
  const numSeason = Number(draft.season);
  const allValid =
    Number.isFinite(numWeekday) && numWeekday >= 0 &&
    Number.isFinite(numWeekend) && numWeekend >= 0 &&
    Number.isFinite(numSeason) && numSeason >= 0;
  const hasChanges =
    numWeekday !== initialPricing.weekday ||
    numWeekend !== initialPricing.weekend ||
    numSeason !== initialPricing.season;

  const tierMeta: Array<{ key: keyof Pricing; label: string; hint: string }> = [
    { key: 'weekday', label: 'Weekday rate', hint: 'Sun–Thu' },
    { key: 'weekend', label: 'Weekend rate', hint: 'Fri–Sat' },
    { key: 'season', label: 'Season rate', hint: 'Holidays / peak periods' },
  ];

  // Read-only display when not editing
  if (phase === 'idle') {
    return (
      <div className="ix-card p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2">
            <DollarSign size={14} /> Boat rental pricing
          </h3>
          <button
            type="button"
            onClick={() => setPhase('editing')}
            className="ix-btn-secondary text-xs inline-flex items-center gap-1"
          >
            <Edit2 size={12} /> Edit pricing
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {tierMeta.map(t => (
            <div key={t.key}>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">{t.label}</div>
              <div className="font-mono">EGP {initialPricing[t.key].toLocaleString()}</div>
              <div className="text-[10px] text-slate-500">{t.hint}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'confirming' || phase === 'saving') {
    const changedTiers = tierMeta.filter(t => Number(draft[t.key]) !== initialPricing[t.key]);
    return (
      <div className="ix-card p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Confirm pricing change
            </div>
            <div className="text-amber-800 dark:text-amber-300">
              Update <strong>{boatName}</strong> pricing? New quotes will use these rates immediately. Existing reservations are NOT affected (each trip has its own snapshot).
              <ul className="mt-2 space-y-0.5 text-xs">
                {changedTiers.map(t => (
                  <li key={t.key}>
                    <strong>{t.label}:</strong> EGP {initialPricing[t.key].toLocaleString()} &rarr; EGP {Number(draft[t.key]).toLocaleString()}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-amber-700">Logged in audit trail.</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={() => setPhase('editing')}
            className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
          >
            Back to edit
          </button>
          <button
            type="button"
            disabled={phase === 'saving'}
            onClick={async () => {
              setPhase('saving');
              try {
                const fd = new FormData();
                fd.set('boat_id', boatId);
                fd.set('amount_weekday', String(numWeekday));
                fd.set('amount_weekend', String(numWeekend));
                fd.set('amount_season', String(numSeason));
                await upsertOwnerBoatPricingAction(fd);
                toast('Pricing updated.', { kind: 'success' });
                setPhase('idle');
                router.refresh();
              } catch (err) {
                toast(`Couldn't save: ${(err as Error).message}`, { kind: 'error' });
                setPhase('editing');
              }
            }}
            className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-60"
          >
            {phase === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Confirm change
          </button>
        </div>
      </div>
    );
  }

  // editing
  return (
    <div className="ix-card p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <DollarSign size={14} /> Edit pricing
        </h3>
        <button
          type="button"
          onClick={() => { setDraft(initialPricing); setPhase('idle'); }}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        {tierMeta.map(t => (
          <label key={t.key} className="block text-sm">
            <span className="text-slate-600 dark:text-slate-400 text-xs">{t.label} (EGP)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={draft[t.key]}
              onChange={(e) => setDraft(d => ({ ...d, [t.key]: e.target.value === '' ? 0 : Number(e.target.value) }))}
              className="ix-input mt-1"
            />
            <span className="text-[11px] text-slate-500 mt-0.5 block">{t.hint}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => { setDraft(initialPricing); setPhase('idle'); }}
          className="ix-btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!allValid || !hasChanges}
          onClick={() => setPhase('confirming')}
          className="ix-btn-primary text-xs disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
