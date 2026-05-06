'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { sendSigninDetailsAction } from '../actions';

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success'; at: string }
  | { kind: 'error'; reason: string };

export function SendSigninButton({
  userId,
  hasWhatsapp,
  disabled,
}: {
  userId: string;
  hasWhatsapp: boolean;
  disabled: boolean;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const { toast } = useToast();

  const isBusy = state.kind === 'sending';

  async function onClick() {
    if (disabled) {
      toast('Re-enable the account before sending sign-in details.', { kind: 'error' });
      return;
    }
    if (!hasWhatsapp) {
      toast('Set a WhatsApp number first.', { kind: 'error' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      const fd = new FormData();
      fd.set('user_id', userId);
      const result = await sendSigninDetailsAction(fd);
      if (result.ok) {
        const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setState({ kind: 'success', at });
        toast('Sign-in details sent via WhatsApp.', { kind: 'success' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      } else {
        const reasonMap: Record<string, string> = {
          no_whatsapp: 'No WhatsApp set',
          user_disabled: 'Account disabled',
          not_found: 'User not found',
          forbidden: 'Not authorized',
          enqueue_failed: 'WhatsApp send failed',
        };
        const reason = reasonMap[result.error] || result.error;
        setState({ kind: 'error', reason });
        toast(`Couldn't send: ${reason}`, { kind: 'error' });
        setTimeout(() => setState({ kind: 'idle' }), 5000);
      }
    } catch (err) {
      const reason = (err as Error).message || 'unknown';
      setState({ kind: 'error', reason });
      toast(`Couldn't send: ${reason}`, { kind: 'error' });
      setTimeout(() => setState({ kind: 'idle' }), 5000);
    }
  }

  if (state.kind === 'success') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1 hover:bg-emerald-100"
      >
        <CheckCircle2 size={12} /> Sent at {state.at} — Re-send
      </button>
    );
  }
  if (state.kind === 'error') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-xs px-2 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center gap-1 hover:bg-rose-100"
      >
        <AlertCircle size={12} /> Failed: {state.reason} — Retry
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy || disabled || !hasWhatsapp}
      className="ix-btn-secondary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      title={
        disabled ? 'Re-enable account first' :
        !hasWhatsapp ? 'No WhatsApp number on file' :
        'Send welcome WhatsApp with username + new temp password'
      }
    >
      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      {isBusy ? 'Sending…' : 'Send sign-in details'}
    </button>
  );
}
