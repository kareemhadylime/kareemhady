'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const LABELS: Record<string, string> = {
  submitted: '🛎  Order received',
  preparing: '👨‍🍳  Preparing',
  ready: '✅  Ready',
  delivered: '🍽  Delivered',
  closed: '🍽  Delivered',
  cancelled: '✗  Cancelled',
};

interface OrderShape {
  id: string;
  order_number: number;
  status: 'submitted' | 'preparing' | 'ready' | 'delivered' | 'closed' | 'cancelled';
  submitted_at: string;
  eta_at: string | null;
  total_usd: number | string;
}

interface LineShape {
  id: string;
  item_name_snapshot: string;
  quantity: number;
  unit_price_usd_snapshot: number;
  line_total_usd: number | string;
  modifier_snapshot: Array<{ name_localized: string }>;
  notes: string | null;
}

export function OrderStatusView({
  token, initialOrder, lines, graceSeconds,
}: {
  token: string;
  initialOrder: OrderShape;
  lines: LineShape[];
  graceSeconds: number;
}) {
  const [order, setOrder] = useState<OrderShape>(initialOrder);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const r = await fetch(`/api/dine/${token}/order/${order.id}`);
      if (r.ok) {
        const j = await r.json();
        setOrder(j.order);
      }
    }, 5000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [token, order.id]);

  const submittedMs = new Date(order.submitted_at).getTime();
  const elapsed = Math.floor((now - submittedMs) / 1000);
  const remaining = Math.max(0, graceSeconds - elapsed);
  const canCancel = order.status === 'submitted' && remaining > 0;

  async function cancel() {
    if (!confirm('Cancel this order?')) return;
    setCancelling(true);
    const res = await fetch(`/api/dine/${token}/order/${order.id}/cancel`, { method: 'POST' });
    setCancelling(false);
    if (res.ok) {
      const r = await fetch(`/api/dine/${token}/order/${order.id}`);
      setOrder((await r.json()).order);
    }
  }

  return (
    <div className="px-6 pb-12">
      <h2 className="display text-3xl text-center mt-4 mb-1">
        {LABELS[order.status] ?? order.status}
      </h2>
      {order.eta_at && order.status !== 'cancelled' && order.status !== 'closed' && (
        <p className="text-center text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
          Expected by {new Date(order.eta_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="mt-6 ix-card p-4" style={{ background: 'var(--bh-cream-50, #F2EFEA)' }}>
        <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">
          Order #{String(order.order_number).padStart(4, '0')}
        </h3>
        <ul className="text-sm divide-y divide-slate-200">
          {lines.map(l => (
            <li key={l.id} className="py-2 flex justify-between">
              <span>
                {l.quantity} × {l.item_name_snapshot}
                {l.modifier_snapshot.length > 0 && (
                  <span className="block text-xs text-slate-500">
                    {l.modifier_snapshot.map(m => `+ ${m.name_localized}`).join(', ')}
                  </span>
                )}
                {l.notes && <span className="block text-xs italic text-slate-500">&quot;{l.notes}&quot;</span>}
              </span>
              <span>${Number(l.line_total_usd).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 pt-3 border-t font-semibold flex justify-between">
          <span>Total</span><span>${Number(order.total_usd).toFixed(2)}</span>
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--bh-ink-muted)' }}>
          Charged to your room — settled at checkout.
        </p>
      </div>

      {canCancel && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="block mx-auto mt-4 text-sm underline text-red-600 disabled:opacity-50"
        >
          Cancel order ({remaining}s remaining)
        </button>
      )}

      {(order.status === 'delivered' || order.status === 'closed') && (
        <a
          href={`/api/dine/${token}/receipt/${order.id}`}
          className="block mx-auto mt-6 text-center text-sm underline"
          style={{ color: 'var(--bh-navy)' }}
        >Download receipt</a>
      )}

      <Link
        href={`/dine/${token}`}
        className="block mx-auto mt-6 text-center py-3 px-4 rounded-full"
        style={{
          background: 'var(--bh-navy)',
          color: 'var(--bh-on-navy, #FAF8F4)',
          maxWidth: '16rem',
        }}
      >Order again</Link>
    </div>
  );
}
