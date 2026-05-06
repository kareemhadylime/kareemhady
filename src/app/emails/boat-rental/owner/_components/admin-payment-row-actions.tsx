'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2, X, Check } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import {
  adminEditPaymentAction,
  adminDeletePaymentAction,
} from '@/app/emails/boat-rental/admin/overrides-actions';

type Props = {
  paymentId: string;
  amountEgp: number;
  paidDate: string; // YYYY-MM-DD
  method: string | null;
  note: string | null;
};

export function AdminPaymentRowActions({
  paymentId,
  amountEgp,
  paidDate,
  method,
  note,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  const [amount, setAmount] = useState(String(amountEgp));
  const [date, setDate] = useState(paidDate);
  const [methodVal, setMethodVal] = useState(method ?? 'cash');
  const [noteVal, setNoteVal] = useState(note ?? '');

  async function onSave() {
    if (busy) return;
    setBusy('save');
    try {
      const fd = new FormData();
      fd.set('id', paymentId);
      if (Number(amount) !== amountEgp) fd.set('amount_egp', amount);
      if (date !== paidDate) fd.set('paid_date', date);
      if (methodVal !== (method ?? '')) fd.set('method', methodVal);
      if (noteVal !== (note ?? '')) fd.set('note', noteVal);
      const result = await adminEditPaymentAction(fd);
      if (result.ok) {
        toast('Payment updated.', { kind: 'success' });
        hapticSuccess();
        setEditing(false);
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
        `Delete this payment row?\n\n` +
          `• Amount: EGP ${amountEgp.toLocaleString()}\n` +
          `• Date: ${paidDate}\n` +
          `• Method: ${method ?? '—'}\n\n` +
          `If this was the only payment covering the trip, the reservation will flip back from paid_to_owner to confirmed.`
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      const fd = new FormData();
      fd.set('id', paymentId);
      const result = await adminDeletePaymentAction(fd);
      if (result.ok) {
        toast('Payment deleted.', { kind: 'success' });
        hapticSuccess();
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="ix-input text-xs w-24"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="ix-input text-xs"
        />
        <select
          value={methodVal}
          onChange={(e) => setMethodVal(e.target.value)}
          className="ix-input text-xs"
        >
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank transfer</option>
          <option value="instapay">Instapay</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
          <option value="manual_override">Manual override</option>
        </select>
        <input
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
          placeholder="note"
          className="ix-input text-xs w-32"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={busy !== null}
          title="Save"
          className="text-emerald-600 hover:text-emerald-800 disabled:opacity-60"
        >
          {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy !== null}
          title="Cancel"
          className="text-slate-500 hover:text-slate-800 disabled:opacity-60"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy !== null}
        title="Edit (admin)"
        className="text-amber-600 hover:text-amber-800 disabled:opacity-60"
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy !== null}
        title="Delete (admin)"
        className="text-rose-600 hover:text-rose-800 disabled:opacity-60"
      >
        {busy === 'delete' ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Trash2 size={12} />
        )}
      </button>
    </div>
  );
}
