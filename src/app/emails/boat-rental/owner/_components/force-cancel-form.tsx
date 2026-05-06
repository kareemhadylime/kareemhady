'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { forceCancelReservationOwnerAction } from '../actions';

type Props = {
  reservationId: string;
  status: string;
};

export function ForceCancelForm({ reservationId, status }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (reason.trim().length < 5) {
      toast('Reason must be at least 5 characters.', { kind: 'error' });
      hapticError();
      return;
    }
    if (
      !confirm(
        `Force cancel this reservation? The broker will be notified and the booking will be marked cancelled. This cannot be undone.`
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('id', reservationId);
      fd.set('reason', reason.trim());
      const result = await forceCancelReservationOwnerAction(fd);
      if (result.ok) {
        toast('Reservation cancelled. Broker notified.', { kind: 'success' });
        hapticSuccess();
        setReason('');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } catch (err) {
      toast(`Couldn't cancel: ${(err as Error).message}`, { kind: 'error' });
      hapticError();
    } finally {
      setSubmitting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs text-rose-600 hover:text-rose-800 inline-flex items-center gap-1"
      >
        <AlertTriangle size={12} /> Cancel reservation
      </button>
    );
  }

  return (
    <section className="mt-6 ix-card p-5 border-rose-300 bg-rose-50/40 dark:border-rose-700 dark:bg-rose-950/30">
      <div className="flex items-start justify-between mb-2">
        <h2 className="font-semibold text-rose-900 dark:text-rose-200 text-sm flex items-center gap-2">
          <AlertTriangle size={14} /> Danger zone — force cancel
        </h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-rose-900/80 dark:text-rose-200/80 mb-3">
        Use this when the regular flow won&apos;t work — boat damage, weather, owner
        conflict, client no-show, or the broker is unreachable. The cancellation goes
        through immediately; the broker is notified but cannot veto.{' '}
        {status === 'paid_to_owner' && (
          <span className="block mt-1 font-semibold">
            Payment was already collected — this will mark the reservation as
            <em> refund pending</em> so admin can reconcile with the broker.
          </span>
        )}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row sm:items-end gap-2">
        <label className="text-sm flex-1">
          <span className="text-rose-900/80 dark:text-rose-200/80 text-xs">
            Reason (required, ≥5 chars)
          </span>
          <input
            name="reason"
            required
            minLength={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. boat damaged in marina, can't fulfill"
            className="ix-input mt-1 w-full"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="ix-btn-danger inline-flex items-center gap-1 self-start sm:self-end whitespace-nowrap disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
          {submitting ? 'Cancelling…' : `Force cancel${status === 'paid_to_owner' ? ' (refund pending)' : ''}`}
        </button>
      </form>
    </section>
  );
}
