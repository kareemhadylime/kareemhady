'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cairoTodayIso } from '@/lib/fmt-date';

type Category =
  | 'loan_payment'
  | 'card_payment'
  | 'overdraft_payment'
  | 'bnpl_payment'
  | 'charity'
  | 'rent'
  | 'utility'
  | 'phone'
  | 'subscription'
  | 'insurance'
  | 'school_fee'
  | 'other';

type Currency = 'EGP' | 'USD' | 'EUR' | 'SAR' | 'AED';

export type PaymentLiabilityOption = { id: string; name: string };

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'loan_payment', label: 'Loan payment' },
  { value: 'card_payment', label: 'Card payment' },
  { value: 'overdraft_payment', label: 'Overdraft payment' },
  { value: 'bnpl_payment', label: 'BNPL payment' },
  { value: 'charity', label: 'Charity' },
  { value: 'rent', label: 'Rent' },
  { value: 'utility', label: 'Utility' },
  { value: 'phone', label: 'Phone' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'school_fee', label: 'School fee' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES: Currency[] = ['EGP', 'USD', 'EUR', 'SAR', 'AED'];

export function AddPaymentModal({
  open,
  onClose,
  onSaved,
  liabilities,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  liabilities: PaymentLiabilityOption[];
}) {
  const [occurredOn, setOccurredOn] = useState(cairoTodayIso());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [category, setCategory] = useState<Category>('other');
  const [liabilityId, setLiabilityId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOccurredOn(cairoTodayIso());
    setAmount('');
    setCurrency('EGP');
    setCategory('other');
    setLiabilityId('');
    setNotes('');
    setError(null);
  }, [open]);

  if (!open) return null;

  function cancel() {
    if (saving) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      setError('Date must be YYYY-MM-DD.');
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number.');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/personal/networth/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        occurredOn,
        amount: amt,
        currency,
        category,
        liabilityId: liabilityId || null,
        notes: notes.trim() || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Failed to add payment.');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-md bg-white dark:bg-slate-900 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Add payment
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manual entry. Recurring templates record payments automatically.
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Date</span>
              <input
                type="date"
                className="ix-input"
                value={occurredOn}
                onChange={e => setOccurredOn(e.target.value)}
                required
              />
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

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Amount</span>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              className="ix-input text-right"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </label>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Category</span>
            <select
              className="ix-input"
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
              required
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">
              Linked liability (optional)
            </span>
            <select
              className="ix-input"
              value={liabilityId}
              onChange={e => setLiabilityId(e.target.value)}
            >
              <option value="">— None —</option>
              {liabilities.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Notes</span>
            <textarea
              className="ix-input min-h-[64px] py-2"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="optional context"
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
            <button
              type="submit"
              disabled={saving}
              className="ix-btn-primary disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
