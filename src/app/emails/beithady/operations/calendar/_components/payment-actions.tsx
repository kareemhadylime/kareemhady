'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { ConfirmWriteModal } from './confirm-write-modal';
import { markPaidAction, markUnpaidAction, recomputePaymentAction } from '../actions';

export function PaymentActions({
  reservationId,
  currentStatus,
  totalCents,
  currency,
}: {
  reservationId: string;
  currentStatus: 'paid' | 'partial' | 'unpaid' | 'n_a' | null;
  totalCents: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [showMarkUnpaid, setShowMarkUnpaid] = useState(false);
  const [showRecompute, setShowRecompute] = useState(false);
  const [amountUsd, setAmountUsd] = useState<string>(
    totalCents != null ? (totalCents / 100).toFixed(2) : ''
  );
  const [note, setNote] = useState('');

  const onMarkPaid = () => {
    startTransition(async () => {
      const r = await markPaidAction({
        reservationId,
        amountUsd: amountUsd ? Number(amountUsd) : undefined,
        note: note || undefined,
      });
      if (r.ok) {
        setShowMarkPaid(false);
        setNote('');
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  const onMarkUnpaid = () => {
    startTransition(async () => {
      const r = await markUnpaidAction({ reservationId, note: note || undefined });
      if (r.ok) {
        setShowMarkUnpaid(false);
        setNote('');
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  const onRecompute = () => {
    startTransition(async () => {
      const r = await recomputePaymentAction({ reservationId });
      if (r.ok) {
        setShowRecompute(false);
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 pt-1">
        {currentStatus !== 'paid' && (
          <button onClick={() => setShowMarkPaid(true)} className="ix-btn-primary !text-xs">
            <CheckCircle size={11} /> Mark paid
          </button>
        )}
        {currentStatus === 'paid' && (
          <button onClick={() => setShowMarkUnpaid(true)} className="ix-btn-secondary !text-xs">
            <RotateCcw size={11} /> Revert to unpaid
          </button>
        )}
        <button onClick={() => setShowRecompute(true)} className="ix-btn-secondary !text-xs">
          <RefreshCw size={11} /> Recompute from channel/Stripe
        </button>
      </div>

      {showMarkPaid && (
        <ConfirmWriteModal
          title="Mark reservation as paid"
          description="Records a manual payment in the local DB. Use when you collected payment outside the channel (cash, bank transfer, off-platform). This does NOT push to Guesty."
          warningType="local_only"
          pending={pending}
          onConfirm={onMarkPaid}
          onCancel={() => setShowMarkPaid(false)}
        >
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Amount paid ({currency})</span>
              <input
                type="number"
                step="0.01"
                value={amountUsd}
                onChange={e => setAmountUsd(e.target.value)}
                className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
                placeholder={totalCents != null ? (totalCents / 100).toFixed(2) : 'Total'}
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
                placeholder="e.g. Bank transfer ref #ABC123"
              />
            </label>
          </div>
        </ConfirmWriteModal>
      )}

      {showMarkUnpaid && (
        <ConfirmWriteModal
          title="Revert payment to unpaid"
          description="Sets the local payment status back to unpaid. The status flag dot in the calendar will turn red if check-in is within 7 days."
          warningType="local_only"
          pending={pending}
          onConfirm={onMarkUnpaid}
          onCancel={() => setShowMarkUnpaid(false)}
        >
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Reason (optional)</span>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
              placeholder="e.g. Refund issued, charge disputed"
            />
          </label>
        </ConfirmWriteModal>
      )}

      {showRecompute && (
        <ConfirmWriteModal
          title="Recompute payment status"
          description="Re-runs the payment resolver. For OTAs (Airbnb/Booking/Vrbo) this re-reads the cached channel state. For direct bookings it queries Stripe by reservation_id metadata or amount + check-in window."
          warningType="local_only"
          pending={pending}
          onConfirm={onRecompute}
          onCancel={() => setShowRecompute(false)}
        />
      )}
    </>
  );
}
