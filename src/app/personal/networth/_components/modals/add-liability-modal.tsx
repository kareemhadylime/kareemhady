'use client';

import { useState } from 'react';
import { ArrowLeft, CreditCard, Landmark, ShoppingBag, Wallet, X } from 'lucide-react';
import type { LiabilityKind } from '@/lib/personal/networth/types';

export type LenderOption = {
  id: string;
  name: string;
  kind: string;
};

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;
type Currency = (typeof CURRENCIES)[number];

type Stage2Kind = 'amortizing_loan' | 'bnpl' | 'credit_card' | 'overdraft';

const today = () => new Date().toISOString().slice(0, 10);

const KIND_PICKER: {
  value: Stage2Kind;
  label: string;
  sub: string;
  icon: typeof Landmark;
}[] = [
  {
    value: 'amortizing_loan',
    label: 'Loan',
    sub: 'Fixed-term, amortizing',
    icon: Landmark,
  },
  {
    value: 'bnpl',
    label: 'BNPL',
    sub: 'Buy-now-pay-later instalments',
    icon: ShoppingBag,
  },
  {
    value: 'credit_card',
    label: 'Credit card',
    sub: 'Revolving, statement-based',
    icon: CreditCard,
  },
  {
    value: 'overdraft',
    label: 'Overdraft',
    sub: 'Revolving line of credit',
    icon: Wallet,
  },
];

export function AddLiabilityModal({
  open,
  onClose,
  onAdded,
  lenders,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  lenders: LenderOption[];
}) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [kind, setKind] = useState<Stage2Kind>('amortizing_loan');

  // Shared fields
  const [name, setName] = useState('');
  const [lenderId, setLenderId] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [notes, setNotes] = useState('');

  // Amortizing fields
  const [principal, setPrincipal] = useState('');
  const [aprPct, setAprPct] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [monthlyPayment, setMonthlyPayment] = useState('');

  // Revolving fields
  const [currentBalance, setCurrentBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('1');
  const [dueDay, setDueDay] = useState('15');
  const [minPaymentPct, setMinPaymentPct] = useState('5');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setStage(1);
    setKind('amortizing_loan');
    setName('');
    setLenderId('');
    setCurrency('EGP');
    setNotes('');
    setPrincipal('');
    setAprPct('');
    setTermMonths('');
    setStartDate(today());
    setMonthlyPayment('');
    setCurrentBalance('');
    setCreditLimit('');
    setStatementDay('1');
    setDueDay('15');
    setMinPaymentPct('5');
    setError(null);
  }

  function cancel() {
    if (saving) return;
    reset();
    onClose();
  }

  function pickKind(k: Stage2Kind) {
    setKind(k);
    setError(null);
    // Sensible per-kind defaults for min payment %.
    if (k === 'credit_card') setMinPaymentPct('5');
    if (k === 'overdraft') setMinPaymentPct('2');
    setStage(2);
  }

  function isAmortizing(k: Stage2Kind): k is 'amortizing_loan' | 'bnpl' {
    return k === 'amortizing_loan' || k === 'bnpl';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    type Payload = {
      name: string;
      kind: LiabilityKind;
      currency: Currency;
      lenderId: string | null;
      notes: string | null;
      currentBalance: number;
      principal?: number;
      aprPct?: number;
      termMonths?: number;
      startDate?: string;
      monthlyPayment?: number;
      creditLimit?: number;
      statementDay?: number;
      dueDay?: number;
      minPaymentPct?: number;
    };

    let payload: Payload;

    if (isAmortizing(kind)) {
      const p = parseFloat(principal);
      const apr = parseFloat(aprPct);
      const term = parseInt(termMonths, 10);
      if (!Number.isFinite(p) || p <= 0) {
        setError('Principal must be a positive number.');
        return;
      }
      if (!Number.isFinite(apr) || apr < 0) {
        setError('APR % must be a non-negative number.');
        return;
      }
      if (!Number.isFinite(term) || term <= 0) {
        setError('Term (months) must be a positive integer.');
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        setError('Start date must be YYYY-MM-DD.');
        return;
      }
      const monthlyOverride = monthlyPayment.trim()
        ? parseFloat(monthlyPayment)
        : undefined;
      if (monthlyOverride !== undefined && !Number.isFinite(monthlyOverride)) {
        setError('Monthly payment override must be a number or blank.');
        return;
      }
      payload = {
        name: name.trim(),
        kind,
        currency,
        lenderId: lenderId || null,
        notes: notes.trim() || null,
        // For new amortizing liabilities the current balance equals the principal.
        currentBalance: p,
        principal: p,
        aprPct: apr,
        termMonths: term,
        startDate,
        ...(monthlyOverride !== undefined ? { monthlyPayment: monthlyOverride } : {}),
      };
    } else {
      const bal = parseFloat(currentBalance);
      const limit = parseFloat(creditLimit);
      const stmt = parseInt(statementDay, 10);
      const due = parseInt(dueDay, 10);
      const minPct = parseFloat(minPaymentPct);
      if (!Number.isFinite(bal) || bal < 0) {
        setError('Current balance must be a non-negative number.');
        return;
      }
      if (!Number.isFinite(limit) || limit <= 0) {
        setError('Credit limit must be a positive number.');
        return;
      }
      if (!Number.isInteger(stmt) || stmt < 1 || stmt > 28) {
        setError('Statement day must be 1–28.');
        return;
      }
      if (!Number.isInteger(due) || due < 1 || due > 28) {
        setError('Due day must be 1–28.');
        return;
      }
      if (!Number.isFinite(minPct) || minPct < 0) {
        setError('Min payment % must be a non-negative number.');
        return;
      }
      payload = {
        name: name.trim(),
        kind,
        currency,
        lenderId: lenderId || null,
        notes: notes.trim() || null,
        currentBalance: bal,
        creditLimit: limit,
        statementDay: stmt,
        dueDay: due,
        minPaymentPct: minPct,
      };
    }

    setSaving(true);
    const res = await fetch('/api/personal/networth/liabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Failed to add liability.');
      return;
    }
    reset();
    onAdded();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-lg bg-white dark:bg-slate-900 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            {stage === 2 && (
              <button
                type="button"
                onClick={() => {
                  setStage(1);
                  setError(null);
                }}
                disabled={saving}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {stage === 1 ? 'Add liability' : `Add ${labelFor(kind)}`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {stage === 1
                  ? 'Pick the kind to get the right fields.'
                  : isAmortizing(kind)
                    ? 'A schedule will be generated automatically.'
                    : 'Revolving: balance · limit · statement & due days.'}
              </p>
            </div>
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

        {stage === 1 && (
          <div className="grid grid-cols-2 gap-3">
            {KIND_PICKER.map(k => {
              const Icon = k.icon;
              return (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => pickKind(k.value)}
                  className="ix-card p-4 text-left hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition flex flex-col gap-1.5"
                >
                  <Icon size={22} className="text-indigo-600 dark:text-indigo-300" />
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {k.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {k.sub}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {stage === 2 && (
          <form onSubmit={submit} className="space-y-3">
            <label className="flex flex-col text-xs">
              <span className="mb-1 text-slate-600 dark:text-slate-300">Name</span>
              <input
                type="text"
                className="ix-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={
                  kind === 'amortizing_loan'
                    ? 'e.g., NBE car loan'
                    : kind === 'bnpl'
                      ? 'e.g., ValU laptop'
                      : kind === 'credit_card'
                        ? 'e.g., CIB Platinum'
                        : 'e.g., HSBC overdraft'
                }
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col text-xs">
                <span className="mb-1 text-slate-600 dark:text-slate-300">Lender</span>
                <select
                  className="ix-input"
                  value={lenderId}
                  onChange={e => setLenderId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {lenders.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
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

            {isAmortizing(kind) ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Principal
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="ix-input text-right"
                      value={principal}
                      onChange={e => setPrincipal(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      APR %
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="ix-input text-right"
                      value={aprPct}
                      onChange={e => setAprPct(e.target.value)}
                      placeholder="e.g., 18.50"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Term (months)
                    </span>
                    <input
                      type="number"
                      step="1"
                      inputMode="numeric"
                      className="ix-input text-right"
                      value={termMonths}
                      onChange={e => setTermMonths(e.target.value)}
                      placeholder="e.g., 36"
                      required
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Start date
                    </span>
                    <input
                      type="date"
                      className="ix-input"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      required
                    />
                  </label>
                </div>

                <label className="flex flex-col text-xs">
                  <span className="mb-1 text-slate-600 dark:text-slate-300">
                    Monthly payment override (optional)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="ix-input text-right"
                    value={monthlyPayment}
                    onChange={e => setMonthlyPayment(e.target.value)}
                    placeholder="blank = computed from APR + term"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Current balance
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="ix-input text-right"
                      value={currentBalance}
                      onChange={e => setCurrentBalance(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Credit limit
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="ix-input text-right"
                      value={creditLimit}
                      onChange={e => setCreditLimit(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Statement day
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="28"
                      inputMode="numeric"
                      className="ix-input text-right"
                      value={statementDay}
                      onChange={e => setStatementDay(e.target.value)}
                      required
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Due day
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="28"
                      inputMode="numeric"
                      className="ix-input text-right"
                      value={dueDay}
                      onChange={e => setDueDay(e.target.value)}
                      required
                    />
                  </label>
                  <label className="flex flex-col text-xs">
                    <span className="mb-1 text-slate-600 dark:text-slate-300">
                      Min payment %
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="ix-input text-right"
                      value={minPaymentPct}
                      onChange={e => setMinPaymentPct(e.target.value)}
                      required
                    />
                  </label>
                </div>
              </>
            )}

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

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setStage(1);
                  setError(null);
                }}
                disabled={saving}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center gap-1"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <div className="flex gap-2">
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
                  {saving ? 'Adding…' : 'Add liability'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function labelFor(k: Stage2Kind): string {
  switch (k) {
    case 'amortizing_loan':
      return 'loan';
    case 'bnpl':
      return 'BNPL';
    case 'credit_card':
      return 'credit card';
    case 'overdraft':
      return 'overdraft';
  }
}
