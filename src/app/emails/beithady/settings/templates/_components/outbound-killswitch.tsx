'use client';

import { useState, useTransition } from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';
import { setOutboundPausedAction } from '../actions';

export function OutboundKillSwitch({
  initialPaused, initialReason, initialAt,
}: {
  initialPaused: boolean;
  initialReason: string | null;
  initialAt: string | null;
}) {
  const [paused, setPaused] = useState(initialPaused);
  const [reason, setReason] = useState(initialReason || '');
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function flip() {
    setError(null);
    startTransition(async () => {
      const newPaused = !paused;
      const r = newPaused
        ? (reason || 'Manually paused via UI')
        : `Resumed via UI by operator. Previous reason: ${reason || 'n/a'}`;
      const res = await setOutboundPausedAction(newPaused, r);
      if (res.ok) {
        setPaused(newPaused);
        setConfirming(false);
      } else {
        setError(res.error);
      }
    });
  }

  if (paused) {
    return (
      <div className="ix-card p-5 border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={20} className="text-rose-600 dark:text-rose-300" />
          <div>
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-200">All outbound communication is PAUSED</h3>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              Every guest-facing send (WhatsApp, Guesty Inbox, AI auto-reply, pre-arrival, boarding pass, upsell, CSAT) refuses with status 503.
            </p>
          </div>
        </div>
        {initialReason && (
          <div className="text-[11px] text-slate-600 dark:text-slate-300 border-t border-rose-200/60 dark:border-rose-900 pt-2">
            <strong>Reason:</strong> {initialReason}
            {initialAt && <span className="ml-2 opacity-70">· paused {new Date(initialAt).toLocaleString()}</span>}
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="!py-2 !text-xs ix-btn-secondary"
          >
            Resume outbound communication…
          </button>
        ) : (
          <div className="space-y-2 border-t border-rose-200/60 dark:border-rose-900 pt-3">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-200 flex items-center gap-1">
              <AlertTriangle size={12} /> Before resuming, confirm you have:
            </p>
            <ul className="text-[11px] text-slate-700 dark:text-slate-200 space-y-0.5 ml-4 list-disc">
              <li>Reviewed every pre-arrival template + approved its body</li>
              <li>Reviewed every upsell catalog item + approved its copy</li>
              <li>Re-added the cron schedules in <code>vercel.json</code> if you want them firing again (they were stripped during the incident)</li>
            </ul>
            <div className="flex items-center gap-2 pt-1">
              <button type="button" onClick={flip} disabled={pending}
                className="!py-1.5 !text-xs px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1">
                <ShieldCheck size={12} /> {pending ? 'Resuming…' : 'Yes, resume outbound'}
              </button>
              <button type="button" onClick={() => setConfirming(false)} disabled={pending}
                className="!py-1.5 !text-xs ix-btn-secondary">
                Cancel
              </button>
              {error && <span className="text-rose-700 dark:text-rose-300 text-xs">{error}</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ix-card p-5 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-300" />
        <div>
          <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-200">Outbound communication is LIVE</h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Approved templates can fire. Pause this immediately if you spot any unauthorized message.
          </p>
        </div>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">Reason for pause (optional)</span>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Investigating a complaint…"
          className="ix-input !py-1.5 !text-sm"
        />
      </label>
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        className="!py-2 !text-xs px-4 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2"
      >
        <ShieldAlert size={14} /> {pending ? 'Pausing…' : 'Pause ALL outbound communication'}
      </button>
      {error && <span className="text-rose-700 dark:text-rose-300 text-xs">{error}</span>}
    </div>
  );
}
