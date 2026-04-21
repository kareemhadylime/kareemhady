'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, CheckCircle2, Building2, Calendar, User } from 'lucide-react';

export type AirbnbLineItem = {
  confirmation_code: string;
  guest_name: string;
  listing_name: string | null;
  listing_airbnb_id?: string | null;
  booking_type: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  amount: number;
  currency: string;
  is_refund: boolean;
  building_code: string | null;
  email_sent_date: string | null;
};

export type CrossMatchBookingClient = {
  booking_id: string;
  channel: string;
  listing_name: string;
  listing_code: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  total_payout: number;
  currency: string;
  building_code: string;
};

const fmt = (n: number | string | null | undefined): string =>
  Math.round(Number(n) || 0).toLocaleString();

export function AirbnbLineItemsTable({
  lineItems,
  bookings,
  crossMatchRunAt,
}: {
  lineItems: AirbnbLineItem[];
  bookings: CrossMatchBookingClient[];
  crossMatchRunAt: string | null;
}) {
  const [open, setOpen] = useState<AirbnbLineItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const { byCode, byGuest } = useMemo(() => {
    const byCode = new Map<string, CrossMatchBookingClient>();
    const byGuest = new Map<string, CrossMatchBookingClient[]>();
    for (const b of bookings) {
      if (b.booking_id) {
        byCode.set(b.booking_id.toUpperCase().trim(), b);
      }
      const gKey = (b.guest_name || '').toLowerCase().trim();
      if (gKey) {
        const list = byGuest.get(gKey) || [];
        list.push(b);
        byGuest.set(gKey, list);
      }
    }
    return { byCode, byGuest };
  }, [bookings]);

  const lookup = (
    code: string | null | undefined,
    guestName: string | null | undefined
  ): CrossMatchBookingClient | null => {
    if (code) {
      const m = byCode.get(code.toUpperCase().trim());
      if (m) return m;
    }
    if (guestName) {
      const list = byGuest.get(guestName.toLowerCase().trim());
      if (list && list.length === 1) return list[0];
    }
    return null;
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const openedMatch = open ? lookup(open.confirmation_code, open.guest_name) : null;
  const openedDiff =
    open && openedMatch && !open.is_refund
      ? Math.round((open.amount - openedMatch.total_payout) * 100) / 100
      : null;

  return (
    <>
      <div className="ix-card overflow-hidden mt-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-rose-50/60 text-rose-900">
              <tr>
                <th className="text-left py-2.5 px-4 font-medium">Code</th>
                <th className="text-left px-4 font-medium">Guest</th>
                <th className="text-left px-4 font-medium">Type</th>
                <th className="text-left px-4 font-medium">Listing</th>
                <th className="text-left px-4 font-medium">Bldg</th>
                <th className="text-left px-4 font-medium">Matched Bldg</th>
                <th className="text-right px-4 font-medium">Expected (USD)</th>
                <th className="text-left px-4 font-medium">Stay</th>
                <th className="text-right px-4 font-medium">Amount (USD)</th>
                <th className="text-left px-4 font-medium">Payout date</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, i) => {
                const match = lookup(li.confirmation_code, li.guest_name);
                const expected = match?.total_payout ?? null;
                const diff =
                  expected != null && !li.is_refund
                    ? Math.round((li.amount - expected) * 100) / 100
                    : null;
                return (
                  <tr
                    key={`${li.confirmation_code}-${i}`}
                    onClick={() => setOpen(li)}
                    className={`border-t border-slate-100 hover:bg-rose-50/40 cursor-pointer ${
                      match ? '' : 'opacity-95'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-xs text-rose-700 font-semibold">
                      {li.confirmation_code}
                    </td>
                    <td className="px-4">{li.guest_name}</td>
                    <td className="px-4 text-xs">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {li.booking_type || '—'}
                      </span>
                    </td>
                    <td
                      className="px-4 max-w-[260px] truncate text-xs"
                      title={li.listing_name || undefined}
                    >
                      {li.listing_name || '—'}
                    </td>
                    <td className="px-4 font-mono text-xs font-semibold">
                      {li.building_code || '—'}
                    </td>
                    <td className="px-4 font-mono text-xs">
                      {match ? (
                        <span className="font-semibold text-emerald-700">
                          {match.building_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 text-right tabular-nums text-xs">
                      {expected != null ? (
                        <span
                          className="font-medium text-slate-700"
                          title={
                            diff != null
                              ? `Δ vs paid: ${diff >= 0 ? '+' : ''}${diff.toLocaleString()} USD`
                              : undefined
                          }
                        >
                          {fmt(expected)}
                          {diff != null && Math.abs(diff) > 1 && (
                            <span
                              className={`ml-1 text-[10px] ${
                                diff > 0 ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {diff > 0 ? '↑' : '↓'}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 text-xs whitespace-nowrap">
                      {li.check_in_date && li.check_out_date
                        ? `${li.check_in_date} → ${li.check_out_date}`
                        : '—'}
                    </td>
                    <td className="px-4 text-right tabular-nums font-medium">
                      {fmt(li.amount)}
                    </td>
                    <td className="px-4 text-xs text-slate-500 whitespace-nowrap">
                      {li.email_sent_date || '—'}
                    </td>
                  </tr>
                );
              })}
              {!lineItems.length && (
                <tr>
                  <td colSpan={10} className="py-4 px-4 text-slate-500 text-center">
                    No Airbnb line items in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lineItems.length > 0 && (
          <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/50">
            Click any row to see full details {crossMatchRunAt ? `(cross-matched against Guesty bookings last run ${new Date(crossMatchRunAt).toLocaleString()})` : ''}
          </div>
        )}
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        onClick={e => {
          // backdrop click (click outside the inner panel)
          if (e.target === dialogRef.current) setOpen(null);
        }}
        className="p-0 rounded-2xl shadow-2xl backdrop:bg-slate-900/50 max-w-2xl w-full"
      >
        {open && (
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/60">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold text-rose-700">
                    {open.confirmation_code}
                  </span>
                  {open.is_refund && (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Refund
                    </span>
                  )}
                  {open.booking_type && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                      {open.booking_type}
                    </span>
                  )}
                  {openedMatch && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                      <CheckCircle2 size={10} /> matched Guesty
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-semibold">{open.guest_name}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  Listing (from Airbnb email)
                </div>
                <div className="text-sm text-slate-800 break-words">
                  {open.listing_name || '—'}
                </div>
                {open.listing_airbnb_id && (
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Airbnb listing id: {open.listing_airbnb_id}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <DetailCell
                  label="Amount (USD)"
                  value={fmt(open.amount)}
                  icon={null}
                  tone={open.is_refund ? 'rose' : 'default'}
                />
                <DetailCell
                  label="Airbnb bldg"
                  value={open.building_code || '—'}
                  icon={Building2}
                />
                <DetailCell
                  label="Stay"
                  value={
                    open.check_in_date && open.check_out_date
                      ? `${open.check_in_date} → ${open.check_out_date}`
                      : '—'
                  }
                  icon={Calendar}
                />
                <DetailCell
                  label="Payout sent"
                  value={open.email_sent_date || '—'}
                  icon={null}
                />
              </div>

              {openedMatch ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs uppercase tracking-wider font-semibold mb-3">
                    <CheckCircle2 size={14} /> Matched Guesty booking
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <DetailCell label="Channel" value={openedMatch.channel} />
                    <DetailCell
                      label="Guesty bldg"
                      value={openedMatch.building_code}
                      icon={Building2}
                    />
                    <DetailCell
                      label="Listing code"
                      value={openedMatch.listing_code}
                      mono
                    />
                    <DetailCell
                      label="Expected payout"
                      value={`${fmt(openedMatch.total_payout)} ${openedMatch.currency}`}
                    />
                    <DetailCell label="Nights" value={String(openedMatch.nights)} />
                    <DetailCell
                      label="Guest (Guesty)"
                      value={openedMatch.guest_name}
                      icon={User}
                    />
                    <DetailCell
                      label="Check-in"
                      value={openedMatch.check_in_date}
                      icon={Calendar}
                    />
                    <DetailCell
                      label="Check-out"
                      value={openedMatch.check_out_date}
                      icon={Calendar}
                    />
                    <DetailCell
                      label="Guesty listing"
                      value={openedMatch.listing_name}
                      wrap
                    />
                  </div>
                  {openedDiff != null && Math.abs(openedDiff) > 1 && (
                    <div
                      className={`mt-3 text-xs px-2 py-1 rounded ${
                        openedDiff > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {openedDiff > 0
                        ? `Paid ${fmt(openedDiff)} USD MORE than Guesty expected`
                        : `Paid ${fmt(Math.abs(openedDiff))} USD LESS than Guesty expected`}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  No matching Guesty booking found for this confirmation code.
                  Possible reasons: the booking rule hasn't run yet in this date
                  range, the confirmation code wasn't parsed on the Guesty side,
                  or this is a non-Airbnb channel paid through Stripe.
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 text-right">
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="ix-btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

function DetailCell({
  label,
  value,
  icon: Icon,
  mono,
  wrap,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ size?: number; className?: string }> | null;
  mono?: boolean;
  wrap?: boolean;
  tone?: 'default' | 'rose';
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-0.5 flex items-center gap-1">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div
        className={`text-sm ${mono ? 'font-mono' : ''} ${wrap ? 'break-words' : 'truncate'} ${
          tone === 'rose' ? 'text-rose-700 font-semibold' : 'text-slate-800'
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
