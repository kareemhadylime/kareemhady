'use client';
import { useEffect, useState } from 'react';

interface OrderRow {
  id: string;
  order_number: number;
  status: string;
  total_usd: number;
  delivered_at: string | null;
  closed_at: string | null;
  guesty_charge_id: string | null;
}

interface ChargesResponse {
  reservation_id: string;
  orders: OrderRow[];
  unsettled_count: number;
  unsettled_total_usd: number;
  total_usd: number;
}

interface Props {
  reservationId: string;
  canMarkSettled: boolean;
}

export function FnbChargesSection({ reservationId, canMarkSettled }: Props) {
  const [data, setData] = useState<ChargesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/beithady/fnb/reservations/${reservationId}/charges`);
    if (r.ok) setData(await r.json());
  }
  useEffect(() => { load(); }, [reservationId]);

  async function settle(orderId: string) {
    const guesty_charge_id = prompt('Guesty receipt # (optional)') || null;
    const note = prompt('Note (optional)') || null;
    setBusy(orderId);
    const r = await fetch(`/api/beithady/fnb/orders/${orderId}/mark-settled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guesty_charge_id, note }),
    });
    setBusy(null);
    if (r.ok) load();
    else alert('Failed.');
  }

  if (!data) return null;
  if (data.orders.length === 0) {
    return <p className="text-xs text-slate-400">No F&B orders for this reservation.</p>;
  }
  return (
    <section className="ix-card p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        F&B charges
        {data.unsettled_count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-700">
            {data.unsettled_count} unsettled · ${data.unsettled_total_usd.toFixed(2)}
          </span>
        )}
      </h3>
      <ul className="divide-y text-sm">
        {data.orders.map(o => (
          <li key={o.id} className="py-2 flex items-center justify-between">
            <span>
              #{String(o.order_number).padStart(4, '0')} · {o.status}
              {o.delivered_at && (
                <span className="text-xs text-slate-400 ml-2">
                  delivered {new Date(o.delivered_at).toLocaleString()}
                </span>
              )}
            </span>
            <span className="flex items-center gap-3">
              <span>${Number(o.total_usd).toFixed(2)}</span>
              {(o.status === 'delivered' || o.status === 'closed') && !o.guesty_charge_id && canMarkSettled && (
                <button
                  onClick={() => settle(o.id)}
                  disabled={busy === o.id}
                  className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                >{busy === o.id ? '…' : 'Mark settled'}</button>
              )}
              {o.guesty_charge_id && (
                <span className="text-xs text-emerald-600">✓ {o.guesty_charge_id}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 pt-3 border-t font-semibold flex justify-between">
        <span>Total F&B</span><span>${data.total_usd.toFixed(2)}</span>
      </p>
    </section>
  );
}
