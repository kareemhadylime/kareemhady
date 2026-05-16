'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type LiabilityOption = {
  id: string;
  name: string;
  kind: string;
};

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

type Frequency = 'monthly' | 'quarterly' | 'yearly';
type Currency = 'EGP' | 'USD' | 'EUR' | 'SAR' | 'AED';

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
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export type RecurringEditing = {
  id: string;
  name: string;
  category: Category;
  amount: number;
  currency: Currency;
  frequency: Frequency;
  day_of_period: number;
  month_of_year: number | null;
  liability_id: string | null;
  notes: string | null;
};

export function AddRecurringModal({
  open,
  onClose,
  onSaved,
  liabilities,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  liabilities: LiabilityOption[];
  editing?: RecurringEditing | null;
}) {
  const isEdit = !!editing;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('subscription');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [dayOfPeriod, setDayOfPeriod] = useState('1');
  const [monthOfYear, setMonthOfYear] = useState('1');
  const [liabilityId, setLiabilityId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when opening or switching between add/edit.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCategory(editing.category);
      setAmount(String(editing.amount));
      setCurrency(editing.currency);
      setFrequency(editing.frequency);
      setDayOfPeriod(String(editing.day_of_period));
      setMonthOfYear(String(editing.month_of_year ?? 1));
      setLiabilityId(editing.liability_id ?? '');
      setNotes(editing.notes ?? '');
    } else {
      setName('');
      setCategory('subscription');
      setAmount('');
      setCurrency('EGP');
      setFrequency('monthly');
      setDayOfPeriod('1');
      setMonthOfYear('1');
      setLiabilityId('');
      setNotes('');
    }
    setError(null);
  }, [open, editing]);

  if (!open) return null;

  function cancel() {
    if (saving) return;
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    const day = parseInt(dayOfPeriod, 10);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setError('Day of period must be 1–28.');
      return;
    }
    let monthVal: number | null = null;
    if (frequency === 'yearly') {
      const m = parseInt(monthOfYear, 10);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        setError('Month of year must be 1–12.');
        return;
      }
      monthVal = m;
    }

    type Payload = {
      name: string;
      category: Category;
      amount: number;
      currency: Currency;
      frequency: Frequency;
      dayOfPeriod: number;
      monthOfYear?: number | null;
      liabilityId: string | null;
      notes?: string | null;
    };

    const payload: Payload = {
      name: name.trim(),
      category,
      amount: amt,
      currency,
      frequency,
      dayOfPeriod: day,
      liabilityId: liabilityId || null,
      notes: notes.trim() || null,
    };
    // Only send monthOfYear when relevant. On edit, allow explicit
    // clear by sending null when frequency != yearly.
    if (frequency === 'yearly') {
      payload.monthOfYear = monthVal;
    } else if (isEdit) {
      payload.monthOfYear = null;
    }

    setSaving(true);
    const url = isEdit
      ? `/api/personal/networth/recurring/${editing!.id}`
      : '/api/personal/networth/recurring';
    const method = isEdit ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? (isEdit ? 'Failed to save.' : 'Failed to add.'));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-lg bg-white dark:bg-slate-900 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {isEdit ? 'Edit recurring' : 'Add recurring'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEdit
                ? 'Update template. Next-run date recomputes if cadence changes.'
                : 'Charity, rent, utilities, subscriptions, loan auto-payments.'}
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
              placeholder="e.g., Vodafone phone bill"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Frequency</span>
              <select
                className="ix-input"
                value={frequency}
                onChange={e => setFrequency(e.target.value as Frequency)}
                required
              >
                {FREQUENCIES.map(f => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">
                Day of period (1–28)
              </span>
              <input
                type="number"
                step="1"
                min="1"
                max="28"
                inputMode="numeric"
                className="ix-input text-right"
                value={dayOfPeriod}
                onChange={e => setDayOfPeriod(e.target.value)}
                required
              />
            </label>
          </div>

          {frequency === 'yearly' && (
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Month of year</span>
              <select
                className="ix-input"
                value={monthOfYear}
                onChange={e => setMonthOfYear(e.target.value)}
                required
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}

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
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add recurring'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
