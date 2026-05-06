'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { XCircle, Loader2, Undo2 } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { cancelExpenseAction } from '../actions';

const VOID_WINDOW_MIN = 10;

type Props = {
  expenseId: string;
  status: 'open' | 'paid' | 'cancelled';
  createdAtIso: string;
};

export function VoidExpenseForm({ expenseId, status, createdAtIso }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  // Live countdown for paid-expense void window. Recompute every 30s so the
  // button hides itself the moment the window closes; on remount we just read
  // the current age and decide once.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (status !== 'paid') return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [status]);

  const ageMinutes = (now - new Date(createdAtIso).getTime()) / 60_000;
  const minutesLeft = Math.max(0, VOID_WINDOW_MIN - ageMinutes);
  const inWindow = status === 'paid' && minutesLeft > 0;

  if (status === 'cancelled') return null;
  if (status === 'paid' && !inWindow) {
    return (
      <p className="text-xs text-slate-500 mt-2">
        Locked. Paid expenses can only be voided within {VOID_WINDOW_MIN} min of entry — record a
        reversing entry through admin if this was wrong.
      </p>
    );
  }

  const isVoid = status === 'paid'; // we land here only if inWindow
  const buttonLabel = isVoid ? 'Void recent entry' : 'Cancel expense';
  const Icon = isVoid ? Undo2 : XCircle;
  const confirmMsg = isVoid
    ? `Void this paid expense? Payments recorded against it will be deleted. This is for fat-finger corrections only — no audit trail beyond the audit log.`
    : `Cancel this open bill? Existing payment rows (if any) stay on record but the bill itself becomes voided.`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('id', expenseId);
      if (reason.trim()) fd.set('reason', reason.trim());
      const result = await cancelExpenseAction(fd);
      if (result.ok) {
        toast(
          result.voided_payment
            ? 'Entry voided. Payment rolled back.'
            : 'Bill cancelled.',
          { kind: 'success' }
        );
        hapticSuccess();
        // Send the user back to the list — the detail page will show
        // status: cancelled and won't let them re-act.
        router.push('/emails/boat-rental/owner/money/expenses');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } catch (err) {
      toast(`Couldn’t cancel: ${(err as Error).message}`, { kind: 'error' });
      hapticError();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row sm:items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="ix-input text-sm flex-1 max-w-md"
      />
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-1 text-sm text-rose-700 hover:text-rose-900 dark:text-rose-300 dark:hover:text-rose-100 disabled:opacity-60 whitespace-nowrap"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
        {submitting ? 'Working…' : buttonLabel}
        {isVoid && (
          <span className="text-[11px] text-slate-500 ml-1">
            ({Math.ceil(minutesLeft)} min left)
          </span>
        )}
      </button>
    </form>
  );
}
