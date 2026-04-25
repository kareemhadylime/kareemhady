'use client';

import { useState, useTransition } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { cancelReservationBrokerAction, requestCancellationAction } from '../actions';

// Broker-side cancel button. Forks based on `requiresOwnerApproval`
// (computed server-side from booking_date < now+72h, Cairo). Outside the
// 72h window: cancellation is final on click. Inside: it submits a
// request that the owner has to approve.

type Props = {
  reservationId: string;
  status: string;
  requiresOwnerApproval: boolean;     // true when within 72h of booking date
  pendingRequest: boolean;             // true when a request is already in flight
};

const BROKER_REASONS: Array<{ value: string; label: string }> = [
  { value: 'client_withdrew', label: 'Client withdrew' },
  { value: 'client_double_booked', label: 'Client double-booked' },
  { value: 'weather', label: 'Weather' },
  { value: 'owner_request', label: 'Owner asked to cancel' },
  { value: 'other', label: 'Other' },
];

export function CancelReservationButton({
  reservationId,
  status,
  requiresOwnerApproval,
  pendingRequest,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  if (pendingRequest) {
    return (
      <div className="text-xs text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
        <Loader2 size={12} className="animate-pulse" />
        Cancellation pending owner approval
      </div>
    );
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        if (requiresOwnerApproval && status !== 'held') {
          await requestCancellationAction(formData);
          toast('Cancellation request sent to owner for approval', { kind: 'info', duration: 4500 });
        } else {
          await cancelReservationBrokerAction(formData);
          toast('Reservation cancelled', { kind: 'success' });
        }
        hapticSuccess();
        setOpen(false);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Cancel failed', { kind: 'error' });
        hapticError();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300 inline-flex items-center gap-1"
      >
        <X size={12} /> Cancel
      </button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="ix-card p-4 border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/20 mt-2 w-full"
    >
      <input type="hidden" name="id" value={reservationId} />
      <div className="text-sm font-semibold text-rose-900 dark:text-rose-100 mb-2 flex items-center gap-1.5">
        <AlertTriangle size={14} /> Cancel reservation
      </div>
      {requiresOwnerApproval && status !== 'held' && (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded p-2 mb-3">
          Within 72h of the booking — your request goes to the owner for approval. Reservation stays active until they
          decide.
        </p>
      )}
      <label className="text-xs block mb-3">
        <span className="text-slate-600 dark:text-slate-300">Reason *</span>
        <select name="reason" required className="ix-input mt-1">
          <option value="">Select reason…</option>
          {BROKER_REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="ix-btn-ghost text-xs"
        >
          Keep reservation
        </button>
        <button
          type="submit"
          disabled={pending}
          className="ix-btn-danger text-xs disabled:opacity-50"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          {pending
            ? 'Submitting…'
            : requiresOwnerApproval && status !== 'held'
              ? 'Request cancellation'
              : 'Confirm cancel'}
        </button>
      </div>
    </form>
  );
}
