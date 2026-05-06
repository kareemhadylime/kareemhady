'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CancelDialog } from './cancel-dialog';

const NEXT: Record<string, string | null> = {
  submitted: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: 'closed',
  closed: null,
  cancelled: null,
};

interface OrderShape {
  id: string;
  order_number: number;
  building_code: string;
  unit_code: string;
  guest_name: string | null;
  guest_language: string | null;
  status: 'submitted' | 'preparing' | 'ready' | 'delivered' | 'closed' | 'cancelled';
  notes: string | null;
  total_usd: number | string;
}

interface LineShape {
  id: string;
  item_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  line_total_usd: number | string;
  modifier_snapshot: Array<{ name_en: string }>;
  notes: string | null;
}

interface EventShape {
  id: string;
  from_status: string | null;
  to_status: string;
  at: string;
}

export function OrderDetail({
  order: initialOrder, lines, events, canCancel,
}: {
  order: OrderShape;
  lines: LineShape[];
  events: EventShape[];
  canCancel: boolean;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [busy, setBusy] = useState(false);
  const [stockoutBusy, setStockoutBusy] = useState<string | null>(null);

  async function advance() {
    const to = NEXT[order.status]; if (!to) return;
    setBusy(true);
    const res = await fetch(`/api/beithady/fnb/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: to }),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setOrder({ ...(j.order as OrderShape) });
    } else {
      alert((await res.json().catch(() => ({}))).error || 'Failed');
    }
  }

  async function markStockOut(line: LineShape) {
    if (!line.item_id) return;
    if (!confirm(`Mark "${line.item_name_snapshot}" out of stock at ${order.building_code}?`)) return;
    setStockoutBusy(line.id);
    const res = await fetch(`/api/beithady/fnb/buildings/${order.building_code}/stockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: line.item_id, is_out_of_stock: true }),
    });
    setStockoutBusy(null);
    if (res.ok) alert('Stock-out flagged. Auto-clears at midnight Cairo.');
    else alert('Failed.');
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <section className="col-span-12 md:col-span-8">
        <div className="ix-card p-6">
          <div className="flex justify-between items-baseline mb-4">
            <h2 className="text-lg font-semibold">
              Order #{String(order.order_number).padStart(4, '0')}
              <span className="ml-2 text-xs text-slate-500">
                {order.building_code} · Unit {order.unit_code}
              </span>
            </h2>
            <span className="text-xl font-semibold">${Number(order.total_usd).toFixed(2)}</span>
          </div>

          <ul className="divide-y">
            {lines.map(l => (
              <li key={l.id} className="py-3">
                <div className="flex justify-between items-baseline">
                  <span>{l.quantity} × {l.item_name_snapshot}</span>
                  <span>${Number(l.line_total_usd).toFixed(2)}</span>
                </div>
                {l.modifier_snapshot.length > 0 && (
                  <p className="text-xs text-slate-500 ml-4">
                    {l.modifier_snapshot.map(m => `+ ${m.name_en}`).join(', ')}
                  </p>
                )}
                {l.notes && <p className="text-xs italic text-slate-500 ml-4">&quot;{l.notes}&quot;</p>}
                {l.item_id && (
                  <button
                    onClick={() => markStockOut(l)}
                    disabled={stockoutBusy === l.id}
                    className="text-xs text-amber-600 hover:underline ml-4 mt-1 disabled:opacity-50"
                  >
                    {stockoutBusy === l.id ? '…' : `Mark out of stock at ${order.building_code}`}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="mt-3 text-sm bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-2">
              <strong>Order note:</strong> {order.notes}
            </p>
          )}

          <div className="mt-6 flex gap-2 flex-wrap">
            {NEXT[order.status] && (
              <button
                onClick={advance}
                disabled={busy}
                className="ix-btn-primary px-4 py-2 disabled:opacity-50"
              >Mark {NEXT[order.status]} &rarr;</button>
            )}
            {canCancel && order.status !== 'cancelled' && order.status !== 'closed' && (
              <CancelDialog
                orderId={order.id}
                onCancelled={(o) => setOrder(o)}
              />
            )}
            <Link
              href={`/beithady/fnb`}
              className="ix-btn-secondary px-4 py-2"
            >Back to board</Link>
          </div>
        </div>
      </section>

      <aside className="col-span-12 md:col-span-4 space-y-3">
        <div className="ix-card p-4">
          <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">Guest</h3>
          <p className="text-sm">{order.guest_name ?? '—'}</p>
          <p className="text-xs text-slate-500">{order.guest_language?.toUpperCase()}</p>
        </div>
        <div className="ix-card p-4">
          <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">Status timeline</h3>
          <ol className="space-y-2 text-xs">
            {events.map(e => (
              <li key={e.id} className="flex justify-between">
                <span>{e.from_status ?? '∅'} → <strong>{e.to_status}</strong></span>
                <span className="text-slate-400">
                  {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
