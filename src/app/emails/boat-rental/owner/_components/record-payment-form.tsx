'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { recordTripPaymentAction } from '../actions';

type Props = {
  reservationId: string;
  remaining: number;
  todayCairo: string;
};

export function RecordPaymentForm({ reservationId, remaining, todayCairo }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set('reservation_id', reservationId);
    setSubmitting(true);
    try {
      const result = await recordTripPaymentAction(fd);
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
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
      <label className="text-sm">
        <span className="text-slate-600 text-xs">Date</span>
        <input
          name="paid_date"
          type="date"
          defaultValue={todayCairo}
          required
          className="ix-input mt-1"
        />
      </label>
      <label className="text-sm">
        <span className="text-slate-600 text-xs">Method</span>
        <select name="method" required defaultValue="cash" className="ix-input mt-1">
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="instapay">Instapay</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="text-slate-600 text-xs">
          Amount (EGP) — remaining: {remaining.toLocaleString()}
        </span>
        <input
          name="amount_egp"
          type="number"
          inputMode="numeric"
          min="1"
          max={remaining}
          step="1"
          required
          className="ix-input mt-1"
        />
      </label>
      <label className="text-sm">
        <span className="text-slate-600 text-xs">Note</span>
        <input name="note" className="ix-input mt-1" placeholder="optional" />
      </label>
      <div className="sm:col-span-4">
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
