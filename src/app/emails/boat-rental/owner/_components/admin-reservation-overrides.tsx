'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Loader2, Trash2, Save as SaveIcon, Pencil, X } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import {
  adminEditReservationAction,
  adminDeleteReservationAction,
} from '@/app/emails/boat-rental/admin/overrides-actions';

type Props = {
  reservationId: string;
  initial: {
    price_egp: number;
    booking_date: string;
    source: string;
    notes: string | null;
  };
};

export function AdminReservationOverrides({ reservationId, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'edit' | 'delete' | null>(null);
  // The override panel is hidden by default — admin clicks "Edit" to open
  // the form, or "Delete" to fire the destructive flow directly. Most
  // booking-detail views are read-only; the form was clutter when shown
  // unconditionally.
  const [editing, setEditing] = useState(false);

  const [price, setPrice] = useState(String(initial.price_egp));
  const [date, setDate] = useState(initial.booking_date);
  const [source, setSource] = useState(initial.source);
  const [notes, setNotes] = useState(initial.notes ?? '');

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy('edit');
    try {
      const fd = new FormData();
      fd.set('id', reservationId);
      if (price !== String(initial.price_egp)) fd.set('price_egp', price);
      if (date !== initial.booking_date) fd.set('booking_date', date);
      if (source !== initial.source) fd.set('source', source);
      if (notes !== (initial.notes ?? '')) fd.set('notes', notes);
      const result = await adminEditReservationAction(fd);
      if (result.ok) {
        toast('Reservation updated.', { kind: 'success' });
        hapticSuccess();
        // Close back to the list view — that's where admin came from when
        // clicking Edit on a row.
        router.push('/emails/boat-rental/admin/bookings');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (busy) return;
    if (
      !confirm(
        `PERMANENTLY DELETE this reservation?\n\n` +
          `• Boat date: ${initial.booking_date}\n` +
          `• Price: EGP ${initial.price_egp.toLocaleString()}\n\n` +
          `This deletes the reservation row, all linked payments, the booking details record, and any queued notifications. The audit log keeps a snapshot.\n\n` +
          `This cannot be undone. Type the date in the next prompt to confirm.`
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Type the booking date (${initial.booking_date}) to confirm permanent deletion:`
    );
    if (typed?.trim() !== initial.booking_date) {
      toast('Cancelled — date didn’t match.', { kind: 'info' });
      return;
    }
    setBusy('delete');
    try {
      const fd = new FormData();
      fd.set('id', reservationId);
      const reason = window.prompt('Reason for deletion (recorded in audit log):') ?? '';
      fd.set('reason', reason);
      const result = await adminDeleteReservationAction(fd);
      if (result.ok) {
        toast('Reservation deleted.', { kind: 'success' });
        hapticSuccess();
        router.push('/emails/boat-rental/owner/calendar');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(null);
    }
  }

  // Collapsed by default — admin only sees Edit / Delete buttons. The
  // form expands when Edit is clicked. Delete fires the confirm flow
  // directly from the collapsed state (no reason to open the form first).
  if (!editing) {
    return (
      <section className="mt-6 ix-card p-4 border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200 text-sm flex items-center gap-2">
            <ShieldAlert size={14} /> Admin overrides
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
              className="ix-btn-primary inline-flex items-center gap-1 disabled:opacity-60 text-sm"
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy !== null}
              className="ix-btn-danger inline-flex items-center gap-1 disabled:opacity-60 text-sm"
            >
              {busy === 'delete' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 ix-card p-5 border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-amber-900 dark:text-amber-200 text-sm flex items-center gap-2">
          <ShieldAlert size={14} /> Admin overrides — Edit
        </h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy !== null}
          className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <X size={14} /> Close
        </button>
      </div>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mb-3">
        Edit any field directly. Every change is logged.
      </p>

      <form onSubmit={onSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Price (EGP)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="ix-input mt-1"
          >
            <option value="registered_broker">Registered broker</option>
            <option value="external_broker">External broker</option>
            <option value="client_direct">Client direct</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-slate-600 text-xs">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="ix-input mt-1"
          />
        </label>
        <div className="sm:col-span-2 flex justify-end items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy !== null}
            className="ix-btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy !== null}
            className="ix-btn-primary inline-flex items-center gap-1 disabled:opacity-60"
          >
            {busy === 'edit' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <SaveIcon size={14} />
            )}
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}
