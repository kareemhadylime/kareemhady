'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { sendReconfirmationAction } from '../calendar/actions';

export function ReconfirmButton({
  reservationId,
  hasPhone,
  recentlySent,
}: {
  reservationId: string;
  hasPhone: boolean;
  recentlySent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<'ok' | 'err' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasPhone) {
    return <span className="text-[10px] text-slate-400">No phone</span>;
  }

  const submit = () => {
    if (recentlySent && !confirm('A re-confirmation was already sent in the last 24h. Send another?')) return;
    startTransition(async () => {
      const r = await sendReconfirmationAction({ reservationId });
      if (r.ok) {
        setResult('ok');
        router.refresh();
      } else {
        setResult('err');
        setError(r.error || 'unknown');
      }
    });
  };

  if (pending) {
    return (
      <button disabled className="ix-btn-secondary !text-xs inline-flex items-center gap-1">
        <Loader2 size={11} className="animate-spin" /> Sending…
      </button>
    );
  }

  if (result === 'ok') {
    return (
      <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1">
        <CheckCircle2 size={11} /> Sent
      </span>
    );
  }

  if (result === 'err') {
    return (
      <button
        onClick={submit}
        className="text-[10px] text-rose-600 inline-flex items-center gap-1 hover:underline"
        title={error || 'Send failed'}
      >
        <AlertCircle size={11} /> Retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={submit}
      className={`text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded ${
        recentlySent
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-200 hover:bg-amber-100'
          : 'bg-cyan-600 text-white hover:bg-cyan-700'
      }`}
    >
      <Send size={10} /> {recentlySent ? 'Re-send' : 'Re-confirm'}
    </button>
  );
}
