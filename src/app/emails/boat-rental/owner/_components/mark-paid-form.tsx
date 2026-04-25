'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { enqueueMarkPaid } from '@/lib/offline/mark-paid-queue';

// Offline-aware Mark Paid form. Always POSTs to the idempotency-keyed
// /api/boat-rental/owner/mark-paid-replay endpoint. On network failure,
// queues to IndexedDB + registers Background Sync so it replays once
// the connection returns. Idempotency dedup means double-fire is safe.

type Props = {
  reservationId: string;
  defaultAmount: number;
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function MarkPaidForm({ reservationId, defaultAmount }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const amount = Number(fd.get('amount_egp'));
    const method = String(fd.get('method') || 'manual_override');
    const note = String(fd.get('note') || '').trim() || null;
    if (!amount || amount <= 0) {
      toast('Enter a valid amount.', { kind: 'error' });
      hapticError();
      return;
    }
    setSubmitting(true);
    const id = uuid();
    const payload = { id, reservationId, amountEgp: amount, method, note };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueMarkPaid({ reservationId, amountEgp: amount, method, note });
      toast('Offline — saved. Will send when back online.', { kind: 'info', duration: 4500 });
      hapticSuccess();
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/boat-rental/owner/mark-paid-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok || res.status === 409) {
        toast('Marked as paid. Owner notification sent.', { kind: 'success' });
        hapticSuccess();
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast(`Couldn't save: ${body?.error || res.status}`, { kind: 'error' });
        hapticError();
      }
    } catch {
      // Network failed mid-flight — queue the request.
      await enqueueMarkPaid({ reservationId, amountEgp: amount, method, note });
      toast('Connection lost — saved. Will send when back online.', { kind: 'info', duration: 4500 });
      hapticSuccess();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="text-sm">
        <span className="text-slate-600 dark:text-slate-400 text-xs">Amount received (EGP) *</span>
        <input
          name="amount_egp"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          required
          defaultValue={defaultAmount}
          className="ix-input mt-1"
        />
      </label>
      <label className="text-sm">
        <span className="text-slate-600 dark:text-slate-400 text-xs">Method</span>
        <select name="method" className="ix-input mt-1" defaultValue="manual_override">
          <option value="manual_override">Manual override</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="instapay">Instapay</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="text-slate-600 dark:text-slate-400 text-xs">Note</span>
        <input name="note" className="ix-input mt-1" />
      </label>
      <div className="md:col-span-3">
        <button
          type="submit"
          disabled={submitting}
          className="ix-btn-primary disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {submitting ? 'Saving…' : 'Confirm received'}
        </button>
        <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-slate-500">
          <WifiOff size={12} />
          Works offline — auto-syncs on reconnect.
        </span>
      </div>
    </form>
  );
}
