'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, DollarSign, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { overrideTripPriceAction } from '../actions';

type Props = {
  reservationId: string;
  currentPrice: number;
  totalPaid: number;
  bookingLabel: string;            // e.g., "Malaya II · 2026-05-06"
  status: 'confirmed' | 'details_filled' | string;
};

type Phase = 'idle' | 'editing' | 'confirming' | 'saving';

export function EditTripPriceForm({ reservationId, currentPrice, totalPaid, bookingLabel, status }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [newPrice, setNewPrice] = useState<string>(String(currentPrice));
  const [reason, setReason] = useState<string>('');

  const isLockedStatus = !['confirmed', 'details_filled'].includes(status);
  const newPriceNum = Number(newPrice);
  const validNumber = Number.isFinite(newPriceNum) && newPriceNum > 0;
  const wouldClamp = validNumber && newPriceNum < totalPaid;
  const effectivePrice = wouldClamp ? totalPaid : newPriceNum;
  const wouldAutoClose = validNumber && totalPaid >= effectivePrice;

  if (isLockedStatus) {
    // Don't render at all when reservation is in a locked state.
    return null;
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setPhase('editing')}
        className="ix-btn-secondary text-xs inline-flex items-center gap-1"
      >
        <DollarSign size={12} /> Edit trip price
      </button>
    );
  }

  if (phase === 'confirming' || phase === 'saving') {
    return (
      <div className="ix-card p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800">
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Confirm price change
            </div>
            <div className="text-amber-800 dark:text-amber-300">
              Change <strong>{bookingLabel}</strong> trip price from{' '}
              <strong>EGP {currentPrice.toLocaleString()}</strong> to{' '}
              <strong>EGP {effectivePrice.toLocaleString()}</strong>?
              {wouldClamp && (
                <div className="mt-1 text-xs">
                  ⚠ You requested EGP {newPriceNum.toLocaleString()}, but EGP {totalPaid.toLocaleString()} has already been paid.
                  The price will be set to EGP {totalPaid.toLocaleString()} (the trip closes with no refund needed).
                </div>
              )}
              {wouldAutoClose && !wouldClamp && (
                <div className="mt-1 text-xs">
                  ✓ Total paid (EGP {totalPaid.toLocaleString()}) already covers this price. Trip will auto-close as paid.
                </div>
              )}
              {reason && (
                <div className="mt-2 text-xs italic">Reason: &ldquo;{reason}&rdquo;</div>
              )}
              <div className="mt-2 text-[11px] text-amber-700">This action is logged in the audit trail.</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={() => setPhase('editing')}
            disabled={phase === 'saving'}
            className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 disabled:opacity-60"
          >
            Back to edit
          </button>
          <button
            type="button"
            disabled={phase === 'saving'}
            onClick={async () => {
              setPhase('saving');
              try {
                const fd = new FormData();
                fd.set('reservation_id', reservationId);
                fd.set('new_price', String(newPriceNum));
                if (reason.trim()) fd.set('reason', reason.trim());
                const result = await overrideTripPriceAction(fd);
                if (result.ok) {
                  const msg = result.was_clamped
                    ? `Price set to EGP ${result.effective_price.toLocaleString()} (clamped to paid total).`
                    : `Trip price updated to EGP ${result.effective_price.toLocaleString()}.`;
                  toast(msg + (result.auto_closed ? ' Trip closed as paid.' : ''), { kind: 'success' });
                  setPhase('idle');
                  setNewPrice(String(result.effective_price));
                  setReason('');
                  router.refresh();
                } else {
                  const reasonMap: Record<string, string> = {
                    reservation_not_found: 'Reservation not found',
                    forbidden: 'Not authorized',
                    invalid_status: 'Trip is locked (cancelled or fully paid)',
                    invalid_amount: 'Amount must be a positive number',
                  };
                  toast(`Couldn't save: ${reasonMap[result.error] || result.error}`, { kind: 'error' });
                  setPhase('editing');
                }
              } catch (err) {
                toast(`Error: ${(err as Error).message}`, { kind: 'error' });
                setPhase('editing');
              }
            }}
            className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-60"
          >
            {phase === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            Confirm change
          </button>
        </div>
      </div>
    );
  }

  // editing phase
  return (
    <div className="ix-card p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <DollarSign size={14} /> Edit trip price
        </h3>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="text-slate-400 hover:text-slate-700"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Current price</label>
          <div className="font-mono text-sm">EGP {currentPrice.toLocaleString()}</div>
          {totalPaid > 0 && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              Already paid: EGP {totalPaid.toLocaleString()}
            </div>
          )}
        </div>
        <label className="block text-sm">
          <span className="text-slate-600 dark:text-slate-400 text-xs">New price (EGP) *</span>
          <input
            type="number"
            min="1"
            step="1"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="ix-input mt-1"
            required
          />
          {wouldClamp && (
            <span className="block text-[11px] text-amber-700 dark:text-amber-300 mt-1">
              ⚠ Below paid total — will be clamped to EGP {totalPaid.toLocaleString()}.
            </span>
          )}
        </label>
      </div>
      <label className="block text-sm mb-3">
        <span className="text-slate-600 dark:text-slate-400 text-xs">Reason (optional)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="e.g., client added catering, weather discount, etc."
          className="ix-input mt-1"
        />
      </label>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="ix-btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!validNumber || newPriceNum === currentPrice}
          onClick={() => setPhase('confirming')}
          className="ix-btn-primary text-xs disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
