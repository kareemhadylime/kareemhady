'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { CalendarReservation } from '@/lib/beithady/operations/types';

const PAYMENT_DOT: Record<NonNullable<CalendarReservation['payment_status']>, string> = {
  paid: 'bg-emerald-400',
  partial: 'bg-amber-400',
  unpaid: 'bg-rose-500',
  n_a: 'bg-slate-400',
};

export function ReservationBar({
  res,
  windowStartIso,
  daysCount,
}: {
  res: CalendarReservation;
  windowStartIso: string;
  daysCount: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  // Compute % positions inside the row's date strip.
  const ws = new Date(windowStartIso + 'T00:00:00').getTime();
  const ci = new Date(res.check_in_date + 'T00:00:00').getTime();
  const co = new Date(res.check_out_date + 'T00:00:00').getTime();
  const oneDay = 86400000;
  const rawStartCol = (ci - ws) / oneDay;
  const rawEndCol = (co - ws) / oneDay; // exclusive
  const startCol = Math.max(0, rawStartCol);
  const endCol = Math.min(daysCount, rawEndCol);
  if (endCol <= 0 || startCol >= daysCount) return null; // out of window
  const leftPct = (startCol / daysCount) * 100;
  const widthPct = ((endCol - startCol) / daysCount) * 100;

  const isCancelled = res.status === 'canceled';
  const isInquiry = res.status === 'inquiry';
  const bg = res.channel_color;
  const fg = '#fff';
  const onClick = () => {
    const next = new URLSearchParams(sp?.toString() || '');
    next.set('reservation', res.reservation_id);
    router.push(`?${next.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${res.guest_name || 'Guest'} · ${res.channel_label} · ${res.check_in_date} → ${res.check_out_date}`}
      className="absolute group rounded shadow-sm overflow-hidden text-left pointer-events-auto outline-none focus:ring-2 focus:ring-[var(--bh-gold)]"
      style={{
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 4px)`,
        top: '4px',
        bottom: '4px',
        background: bg,
        color: fg,
        opacity: isCancelled ? 0.4 : 1,
        backgroundImage: isInquiry
          ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.0) 0 6px, rgba(255,255,255,0.18) 6px 12px)'
          : isCancelled
            ? 'repeating-linear-gradient(45deg, rgba(255,255,255,0.0) 0 4px, rgba(0,0,0,0.18) 4px 8px)'
            : undefined,
        borderLeft: rawStartCol >= 0 ? undefined : '2px solid rgba(255,255,255,0.6)',
        borderRight: rawEndCol <= daysCount ? undefined : '2px solid rgba(255,255,255,0.6)',
      }}
    >
      <div className="px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 leading-tight h-full">
        {/* Loyalty marker */}
        {res.is_vip && <span title="VIP" className="shrink-0">★</span>}
        {/* Payment status dot */}
        {res.payment_status && (
          <span
            className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${PAYMENT_DOT[res.payment_status]}`}
            title={`Payment: ${res.payment_status}`}
          />
        )}
        <span className="truncate">{res.guest_name || res.confirmation_code || 'Reservation'}</span>
        <span className="ml-auto opacity-80 text-[9px] uppercase tracking-wider hidden sm:inline">
          {/* short channel code */}
          {res.channel_label.slice(0, 3)}
        </span>
      </div>
    </button>
  );
}
