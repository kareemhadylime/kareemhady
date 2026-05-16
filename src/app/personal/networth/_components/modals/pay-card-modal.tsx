'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

type Liability = {
  id: string;
  name: string;
  kind: string;
  currency: string;
  current_balance: number | string;
  credit_limit: number | string | null;
  min_payment_pct: number | string | null;
};

type Preset = 'minimum' | 'statement' | 'full' | 'custom';

const PRESETS: { value: Preset; label: string; hint: string }[] = [
  { value: 'minimum', label: 'Minimum', hint: 'min% of balance' },
  { value: 'statement', label: 'Statement', hint: 'statement balance' },
  { value: 'full', label: 'Full', hint: 'pay everything' },
  { value: 'custom', label: 'Custom', hint: 'enter amount' },
];

function fmt(n: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

export function PayCardModal({
  liability,
  onClose,
  onPaid,
}: {
  liability: Liability;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [preset, setPreset] = useState<Preset>('minimum');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = Number(liability.current_balance);
  const minPct = Number(liability.min_payment_pct ?? 0);

  // Preview amount — mirrors recordCardPayment's preset math so the user
  // sees the same number that will be recorded server-side.
  function previewAmount(): number | null {
    switch (preset) {
      case 'minimum':
        if (!minPct) return null;
        return Math.round((balance * minPct) / 100 * 100) / 100;
      case 'statement':
      case 'full':
        return balance;
      case 'custom': {
        const n = parseFloat(customAmount);
        return Number.isFinite(n) && n > 0 ? n : null;
      }
    }
  }

  const preview = previewAmount();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (preset === 'minimum' && !minPct) {
      setError('Minimum payment % not configured on this card.');
      return;
    }
    if (preset === 'custom') {
      const n = parseFloat(customAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError('Enter a positive custom amount.');
        return;
      }
    }
    if (!preview || preview <= 0) {
      setError('Computed amount must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/personal/networth/liabilities/${liability.id}/pay-card`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            preset,
            ...(preset === 'custom'
              ? { customAmount: parseFloat(customAmount) }
              : {}),
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Failed to record payment.');
        return;
      }
      onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (saving) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Pay card
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {liability.name} · balance {fmt(balance, liability.currency)}
            </p>
          </div>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p => {
              const active = preset === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPreset(p.value)}
                  disabled={saving}
                  className={[
                    'rounded-lg border px-3 py-2 text-left transition',
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600',
                  ].join(' ')}
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {p.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {p.hint}
                  </div>
                </button>
              );
            })}
          </div>

          {preset === 'custom' && (
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">
                Custom amount ({liability.currency})
              </span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="ix-input text-right"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </label>
          )}

          <div className="rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Will pay: </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {preview != null ? fmt(preview, liability.currency) : '—'}
            </span>
          </div>

          {error && (
            <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="ix-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || preview == null || preview <= 0}
              className="ix-btn-primary disabled:opacity-50"
            >
              {saving ? 'Recording…' : 'Pay card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
