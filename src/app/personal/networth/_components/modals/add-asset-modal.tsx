'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { AssetKind } from '@/lib/personal/networth/types';

const KINDS: { value: AssetKind; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'gold_jewelry', label: 'Gold / jewelry' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;
type Currency = (typeof CURRENCIES)[number];

const today = () => new Date().toISOString().slice(0, 10);

export function AddAssetModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('cash');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [balance, setBalance] = useState('');
  const [asOfDate, setAsOfDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setName('');
    setKind('cash');
    setCurrency('EGP');
    setBalance('');
    setAsOfDate(today());
    setNotes('');
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const balanceNum = parseFloat(balance);
    if (!Number.isFinite(balanceNum)) {
      setError('Balance must be a number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      setError('As-of date must be YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/personal/networth/assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        kind,
        currency,
        balance: balanceNum,
        asOfDate,
        notes: notes.trim() || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Failed to add asset.');
      return;
    }
    reset();
    onAdded();
    onClose();
  }

  function cancel() {
    if (saving) return;
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Add asset</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cash, real estate, vehicle, gold/jewelry, or other.
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

        <form onSubmit={submit} className="space-y-3">
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Name</span>
            <input
              type="text"
              className="ix-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., NBE savings, Maadi flat, RAV4"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Kind</span>
              <select
                className="ix-input"
                value={kind}
                onChange={e => setKind(e.target.value as AssetKind)}
                required
              >
                {KINDS.map(k => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Currency</span>
              <select
                className="ix-input"
                value={currency}
                onChange={e => setCurrency(e.target.value as Currency)}
                required
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Balance</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="ix-input text-right"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">As of</span>
              <input
                type="date"
                className="ix-input"
                value={asOfDate}
                onChange={e => setAsOfDate(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Notes</span>
            <textarea
              className="ix-input min-h-[64px] py-2"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="optional context (location, account, …)"
            />
          </label>

          {error && (
            <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="ix-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="ix-btn-primary disabled:opacity-50">
              {saving ? 'Adding…' : 'Add asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
