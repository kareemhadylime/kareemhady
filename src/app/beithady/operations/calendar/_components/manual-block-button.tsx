'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ConfirmWriteModal } from './confirm-write-modal';
import { createManualBlockAction } from '../actions';

const REASONS = [
  { value: 'owner_stay', label: 'Owner stay' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'hold', label: 'Hold' },
  { value: 'other', label: 'Other' },
] as const;

export function ManualBlockButton({ listingId, listingNickname, defaultStart }: {
  listingId: string;
  listingNickname: string;
  defaultStart: string;     // YYYY-MM-DD
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => {
    const d = new Date(defaultStart + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [reason, setReason] = useState<typeof REASONS[number]['value']>('owner_stay');
  const [notes, setNotes] = useState('');

  const [conflict, setConflict] = useState<{
    reservation_id: string;
    guest_name: string | null;
    channel: string | null;
    check_in: string;
    check_out: string;
  } | null>(null);

  const submit = (force = false) => {
    startTransition(async () => {
      const r = await createManualBlockAction({
        listingId, startDate: start, endDate: end, reason,
        notes: notes || undefined,
        forceOverride: force,
      });
      if (r.ok) {
        setOpen(false);
        setNotes('');
        setConflict(null);
        if (r.guestySync === false) {
          alert(`Block created locally but Guesty sync failed: ${r.guestyError || 'unknown'}. The block is visible in Beithady; re-sync from Settings later.`);
        }
        router.refresh();
      } else if (r.conflict) {
        setConflict(r.conflict);
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-slate-400 hover:text-rose-600 inline-flex items-center gap-0.5"
        title="Block dates for this unit"
      >
        <Lock size={9} /> Block
      </button>
      {open && !conflict && (
        <ConfirmWriteModal
          title={`Block availability — ${listingNickname}`}
          description="Marks the unit as unavailable for the selected window. The block is visible in this calendar AND pushed to Guesty so OTAs (Airbnb, Booking) won't allow new bookings."
          warningType="guesty_write"
          pending={pending}
          onConfirm={() => submit(false)}
          onCancel={() => setOpen(false)}
        >
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Start</span>
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
              />
            </label>
            <label>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">End (exclusive)</span>
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Reason</span>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as typeof REASONS[number]['value'])}
              className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
            >
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Notes (optional)</span>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
              placeholder="e.g. Plumbing repair, owner visit"
            />
          </label>
        </ConfirmWriteModal>
      )}
      {open && conflict && (
        <ConfirmWriteModal
          title="Overbooking conflict"
          description={`A reservation already overlaps this window. Confirming the block will leave the existing reservation in place but mark the dates unavailable for new bookings — the existing guest will not be notified. Proceed only if you've already coordinated with the guest.`}
          warningType="destructive"
          pending={pending}
          onConfirm={() => submit(true)}
          onCancel={() => { setConflict(null); }}
        >
          <div className="border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-900/10 rounded p-2 space-y-1 text-[11px]">
            <div className="font-semibold text-rose-900 dark:text-rose-200">
              {conflict.guest_name || 'Guest'}{conflict.channel ? ` · ${conflict.channel}` : ''}
            </div>
            <div className="text-slate-600 dark:text-slate-400">
              {conflict.check_in} → {conflict.check_out}
            </div>
            <div className="text-[10px] text-slate-500">
              Res: <code>{conflict.reservation_id}</code>
            </div>
          </div>
        </ConfirmWriteModal>
      )}
    </>
  );
}
