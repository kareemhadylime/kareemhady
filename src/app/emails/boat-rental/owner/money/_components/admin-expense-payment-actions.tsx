'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { adminDeleteExpensePaymentAction } from '@/app/emails/boat-rental/admin/overrides-actions';

type Props = {
  paymentId: string;
  amountEgp: number;
  paidDate: string;
  method: string;
};

export function AdminExpensePaymentActions({ paymentId, amountEgp, paidDate, method }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (busy) return;
    if (
      !confirm(
        `Delete this payment row?\n\n` +
          `• Amount: EGP ${amountEgp.toLocaleString()}\n` +
          `• Date: ${paidDate}\n` +
          `• Method: ${method}\n\n` +
          `If this was the only payment covering the expense, the expense will flip back from paid to open.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('id', paymentId);
      const result = await adminDeleteExpensePaymentAction(fd);
      if (result.ok) {
        toast('Payment deleted.', { kind: 'success' });
        hapticSuccess();
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      title="Delete (admin)"
      className="text-rose-600 hover:text-rose-800 disabled:opacity-60"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
    </button>
  );
}
