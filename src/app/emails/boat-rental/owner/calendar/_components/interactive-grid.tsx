'use client';

import { useState } from 'react';
import Link from 'next/link';
import { OwnerBlockDialog } from './block-dialog';

type ReservationRow = { id: string; booking_date: string; status: string; price_egp_snapshot: string | number };
type BlockRow = { id: string; blocked_date: string; reason: string };

type Props = {
  boatId: string;
  monthLabel: string;
  dates: string[];           // YYYY-MM-DD
  firstDow: number;          // 0..6 padding count
  today: string;
  reservations: ReservationRow[];
  blocks: BlockRow[];
};

function statusColor(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'held':
      return { bg: 'bg-amber-100 hover:bg-amber-200 border-amber-300 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:border-amber-700', text: 'text-amber-900 dark:text-amber-200', label: 'Held' };
    case 'confirmed':
      return { bg: 'bg-blue-100 hover:bg-blue-200 border-blue-300 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 dark:border-blue-700', text: 'text-blue-900 dark:text-blue-200', label: 'Confirmed' };
    case 'details_filled':
      return { bg: 'bg-cyan-100 hover:bg-cyan-200 border-cyan-300 dark:bg-cyan-950/60 dark:hover:bg-cyan-900/60 dark:border-cyan-700', text: 'text-cyan-900 dark:text-cyan-200', label: 'Filed' };
    case 'paid_to_owner':
      return { bg: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:border-emerald-700', text: 'text-emerald-900 dark:text-emerald-200', label: 'Paid' };
    case 'cancelled':
      return { bg: 'bg-rose-100 hover:bg-rose-200 border-rose-300 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:border-rose-700', text: 'text-rose-900 dark:text-rose-200', label: 'Cancelled' };
    case 'expired':
      return { bg: 'bg-slate-100 hover:bg-slate-200 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-600', text: 'text-slate-600 dark:text-slate-400', label: 'Expired' };
    default:
      return { bg: 'bg-white hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-700', text: 'text-slate-400 dark:text-slate-600', label: '' };
  }
}

const BLOCK_STYLE = 'bg-purple-100 hover:bg-purple-200 border-purple-300 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 dark:border-purple-700';

export function InteractiveMonthGrid({
  boatId, dates, firstDow, today, reservations, blocks,
}: Props) {
  const [dialogDate, setDialogDate] = useState<string | null>(null);

  const resByDate = new Map<string, ReservationRow>();
  const priority: Record<string, number> = {
    held: 4, confirmed: 5, details_filled: 6, paid_to_owner: 7, cancelled: 2, expired: 1,
  };
  for (const r of reservations) {
    const cur = resByDate.get(r.booking_date);
    if (!cur || (priority[r.status] || 0) > (priority[cur.status] || 0)) {
      resByDate.set(r.booking_date, r);
    }
  }
  const blockByDate = new Map<string, BlockRow>();
  for (const b of blocks) blockByDate.set(b.blocked_date, b);

  const dialogBlock = dialogDate ? blockByDate.get(dialogDate) : undefined;

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {dates.map(date => {
          const res = resByDate.get(date);
          const block = blockByDate.get(date);
          const dayNum = parseInt(date.slice(-2), 10);
          const isToday = date === today;
          const isPast = date < today;

          // Reservation takes priority over block in display.
          if (res && res.status !== 'expired' && res.status !== 'cancelled') {
            const c = statusColor(res.status);
            return (
              <Link
                key={date}
                href={`/emails/boat-rental/owner/booking/${res.id}`}
                className={`aspect-square p-1.5 rounded border text-left ${c.bg} ${isToday ? 'ring-1 ring-cyan-500' : ''}`}
              >
                <div className={`text-sm font-semibold ${isToday ? 'text-cyan-700 dark:text-cyan-300' : ''}`}>
                  {dayNum}
                </div>
                <div className={`text-[10px] mt-1 ${c.text}`}>{c.label}</div>
              </Link>
            );
          }

          if (block) {
            return (
              <button
                key={date}
                type="button"
                disabled={isPast}
                onClick={() => !isPast && setDialogDate(date)}
                className={`aspect-square p-1.5 rounded border text-left ${BLOCK_STYLE} ${isPast ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={isPast ? 'Past date' : 'Click to manage block'}
              >
                <div className={`text-sm font-semibold ${isToday ? 'text-cyan-700 dark:text-cyan-300' : ''}`}>
                  {dayNum}
                </div>
                <div className="text-[10px] mt-1 text-purple-900 dark:text-purple-200">
                  Blocked
                </div>
              </button>
            );
          }

          // Past or expired/cancelled — display only.
          if (isPast || (res && (res.status === 'expired' || res.status === 'cancelled'))) {
            const c = res ? statusColor(res.status) : statusColor('');
            return (
              <div
                key={date}
                className={`aspect-square p-1.5 rounded border text-left ${c.bg} opacity-60`}
              >
                <div className={`text-sm font-semibold ${isToday ? 'text-cyan-700 dark:text-cyan-300' : ''}`}>
                  {dayNum}
                </div>
                {res && <div className={`text-[10px] mt-1 ${c.text}`}>{c.label}</div>}
              </div>
            );
          }

          // Empty future day — clickable to open block dialog.
          return (
            <button
              key={date}
              type="button"
              onClick={() => setDialogDate(date)}
              className={`aspect-square p-1.5 rounded border bg-white hover:bg-cyan-50 dark:bg-slate-900 dark:hover:bg-cyan-950/30 border-slate-200 dark:border-slate-700 text-left transition ${isToday ? 'ring-1 ring-cyan-500' : ''}`}
              title="Click to block this date"
            >
              <div className={`text-sm font-semibold ${isToday ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-900 dark:text-slate-100'}`}>
                {dayNum}
              </div>
            </button>
          );
        })}
      </div>

      {dialogDate && (
        <OwnerBlockDialog
          boatId={boatId}
          initialDate={dialogDate}
          existingBlock={dialogBlock ? { id: dialogBlock.id, reason: dialogBlock.reason } : null}
          onClose={() => setDialogDate(null)}
        />
      )}
    </>
  );
}
