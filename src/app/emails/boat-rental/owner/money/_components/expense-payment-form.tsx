'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { recordExpensePaymentAction } from '../actions';

type Props = {
  expenseId: string;
  remaining: number;
  todayCairo: string;
  compact?: boolean; // when true, render in a single horizontal row (used by Bills page)
};

export function ExpensePaymentForm({ expenseId, remaining, todayCairo, compact = false }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set('expense_id', expenseId);
    setSubmitting(true);
    try {
      const result = await recordExpensePaymentAction(fd);
      if (result.ok) {
        toast('Payment recorded.', { kind: 'success' });
        hapticSuccess();
        form.reset();
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } catch (err) {
      toast(`Couldn't save: ${(err as Error).message}`, { kind: 'error' });
      hapticError();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        compact
          ? 'flex flex-wrap gap-2 items-end'
          : 'grid grid-cols-1 sm:grid-cols-4 gap-3 items-end'
      }
    >
      <label className={compact ? 'text-sm w-32' : 'text-sm'}>
        <span className="text-slate-600 text-xs">Date</span>
        <input
          name="paid_date"
          type="date"
          defaultValue={todayCairo}
          required
          className="ix-input mt-1"
        />
      </label>
      <label className={compact ? 'text-sm w-36' : 'text-sm'}>
        <span className="text-slate-600 text-xs">Method</span>
        <select name="method" defaultValue="cash" required className="ix-input mt-1">
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="instapay">Instapay</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className={compact ? 'text-sm w-32' : 'text-sm'}>
        <span className="text-slate-600 text-xs">
          Amount{!compact && ` — remaining: ${remaining.toLocaleString()}`}
        </span>
        <input
          name="amount_egp"
          type="number"
          inputMode="numeric"
          min="0.01"
          step="0.01"
          max={remaining}
          required
          className="ix-input mt-1"
        />
      </label>
      {!compact && (
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Note</span>
          <input name="note" className="ix-input mt-1" placeholder="optional" />
        </label>
      )}
      <div className={compact ? '' : 'sm:col-span-4'}>
        <button
          type="submit"
          disabled={submitting || remaining <= 0}
          className="ix-btn-primary disabled:opacity-60 inline-flex items-center gap-1"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {submitting ? 'Saving…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}
