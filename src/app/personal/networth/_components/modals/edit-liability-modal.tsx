'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { LiabilityKind } from '@/lib/personal/networth/types';

type EditableLiability = {
  id: string;
  name: string;
  kind: LiabilityKind;
  apr_pct: number | null;
  monthly_payment: number | null;
  credit_limit: number | null;
  statement_day: number | null;
  due_day: number | null;
  min_payment_pct: number | null;
  notes: string | null;
};

const AMORTIZING_KINDS: LiabilityKind[] = ['amortizing_loan', 'bnpl'];

function isAmortizing(k: LiabilityKind): boolean {
  return AMORTIZING_KINDS.includes(k);
}

function toStr(v: number | null): string {
  return v == null ? '' : String(v);
}

export function EditLiabilityModal({
  open,
  onClose,
  onSaved,
  liability,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  liability: EditableLiability | null;
}) {
  // Amortizing fields
  const [aprPct, setAprPct] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');

  // Revolving fields
  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [minPaymentPct, setMinPaymentPct] = useState('');

  // Shared
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal is opened with a new liability.
  useEffect(() => {
    if (!open || !liability) return;
    setAprPct(toStr(liability.apr_pct));
    setMonthlyPayment(toStr(liability.monthly_payment));
    setCreditLimit(toStr(liability.credit_limit));
    setStatementDay(toStr(liability.statement_day));
    setDueDay(toStr(liability.due_day));
    setMinPaymentPct(toStr(liability.min_payment_pct));
    setNotes(liability.notes ?? '');
    setError(null);
  }, [open, liability]);

  if (!open || !liability) return null;

  function cancel() {
    if (saving) return;
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!liability) return;

    // Build a payload with only the fields valid for this kind.
    // The PATCH route's Zod schema accepts these snake_case keys.
    const payload: Record<string, number | string | null> = {};

    if (isAmortizing(liability.kind)) {
      if (aprPct.trim() !== '') {
        const v = parseFloat(aprPct);
        if (!Number.isFinite(v) || v < 0) {
          setError('APR % must be a non-negative number.');
          return;
        }
        payload.apr_pct = v;
      }
      if (monthlyPayment.trim() !== '') {
        const v = parseFloat(monthlyPayment);
        if (!Number.isFinite(v) || v <= 0) {
          setError('Monthly payment must be a positive number.');
          return;
        }
        payload.monthly_payment = v;
      } else {
        // Allow clearing the field.
        payload.monthly_payment = null;
      }
    } else {
      // Revolving: credit_card / overdraft / other.
      if (creditLimit.trim() !== '') {
        const v = parseFloat(creditLimit);
        if (!Number.isFinite(v) || v < 0) {
          setError('Credit limit must be a non-negative number.');
          return;
        }
        payload.credit_limit = v;
      }
      if (statementDay.trim() !== '') {
        const v = parseInt(statementDay, 10);
        if (!Number.isInteger(v) || v < 1 || v > 28) {
          setError('Statement day must be 1–28.');
          return;
        }
        payload.statement_day = v;
      }
      if (dueDay.trim() !== '') {
        const v = parseInt(dueDay, 10);
        if (!Number.isInteger(v) || v < 1 || v > 28) {
          setError('Due day must be 1–28.');
          return;
        }
        payload.due_day = v;
      }
      if (minPaymentPct.trim() !== '') {
        const v = parseFloat(minPaymentPct);
        if (!Number.isFinite(v) || v < 0) {
          setError('Min payment % must be a non-negative number.');
          return;
        }
        payload.min_payment_pct = v;
      }
    }

    payload.notes = notes.trim() === '' ? null : notes.trim();

    setSaving(true);
    const res = await fetch(
      `/api/personal/networth/liabilities/${liability.id}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? 'Failed to save changes.');
      return;
    }
    onSaved();
    onClose();
  }

  const amortizing = isAmortizing(liability.kind);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ix-card w-full max-w-lg bg-white dark:bg-slate-900 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Edit {liability.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {amortizing
                ? 'Editable: APR, monthly payment, notes.'
                : 'Editable: credit limit, statement & due days, min payment %, notes.'}
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
          {amortizing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
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
                  />
                </label>
                <label className="flex flex-col text-xs">
                  <span className="mb-1 text-slate-600 dark:text-slate-300">
                    Monthly payment
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="ix-input text-right"
                    value={monthlyPayment}
                    onChange={e => setMonthlyPayment(e.target.value)}
                    placeholder="optional"
                  />
                </label>
              </div>
            </>
          ) : (
            <>
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
                />
              </label>

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
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
