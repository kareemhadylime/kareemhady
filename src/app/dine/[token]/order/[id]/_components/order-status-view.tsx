'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatNumber, formatPrice, trOrder, type DineLang } from '../../../_components/i18n';

const STATUS_KEY: Record<string, Parameters<typeof trOrder>[0]> = {
  submitted: 'status_submitted',
  preparing: 'status_preparing',
  ready: 'status_ready',
  delivered: 'status_delivered',
  closed: 'status_delivered',
  cancelled: 'status_cancelled',
};

const REDIRECT_SECONDS = 15;

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
  token, initialOrder, lines, graceSeconds, lang, justPlaced,
}: {
  token: string;
  initialOrder: OrderShape;
  lines: LineShape[];
  graceSeconds: number;
  lang: DineLang;
  justPlaced: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderShape>(initialOrder);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  // Auto-redirect after 15s on a fresh placement only. The user can opt
  // out by clicking "Stay on this page" — useful if they want to monitor
  // status, cancel, or just read details past the 15-second window.
  const [redirectIn, setRedirectIn] = useState<number | null>(
    justPlaced ? REDIRECT_SECONDS : null,
  );

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

  // Countdown + redirect. Runs only when justPlaced. The user can stop it
  // by setting redirectIn to null via the "Stay on this page" button.
  useEffect(() => {
    if (redirectIn === null) return;
    if (redirectIn <= 0) {
      const dest = lang === 'en' ? `/dine/${token}` : `/dine/${token}?lang=${lang}`;
      router.push(dest);
      return;
    }
    const id = setTimeout(() => setRedirectIn(s => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [redirectIn, router, token, lang]);

  const submittedMs = new Date(order.submitted_at).getTime();
  const elapsed = Math.floor((now - submittedMs) / 1000);
  const remaining = Math.max(0, graceSeconds - elapsed);
  const canCancel = order.status === 'submitted' && remaining > 0;

  async function cancel() {
    if (!confirm(trOrder('cancel_confirm', lang))) return;
    setCancelling(true);
    // Cancelling means the user wants to stay; abort the auto-redirect.
    setRedirectIn(null);
    const res = await fetch(`/api/dine/${token}/order/${order.id}/cancel`, { method: 'POST' });
    setCancelling(false);
    if (res.ok) {
      const r = await fetch(`/api/dine/${token}/order/${order.id}`);
      setOrder((await r.json()).order);
    }
  }

  const etaText = order.eta_at
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : lang, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(order.eta_at))
    : '';

  return (
    <div className="px-6 pb-12">
      {/* Thank-you banner — only on fresh placement */}
      {justPlaced && order.status === 'submitted' && (
        <div className="text-center mt-2 mb-4">
          <h2 className="display text-3xl mb-1" style={{ color: 'var(--bh-navy)' }}>
            {trOrder('thanks_for_order', lang)}
          </h2>
          <p className="text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
            {trOrder('enjoy_meal_shortly', lang)}
          </p>
          {redirectIn !== null && redirectIn > 0 && (
            <div className="mt-3 text-xs" style={{ color: 'var(--bh-ink-muted)' }}>
              <p>{trOrder('returning_in', lang, { n: formatNumber(redirectIn, lang) })}</p>
              <button
                onClick={() => setRedirectIn(null)}
                className="mt-1 underline"
                style={{ color: 'var(--bh-navy)' }}
              >
                {trOrder('stay_on_page', lang)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Status headline (also visible during the 15s) */}
      <h2 className="display text-2xl text-center mt-2 mb-1">
        {trOrder(STATUS_KEY[order.status] ?? 'status_submitted', lang)}
      </h2>
      {order.eta_at && order.status !== 'cancelled' && order.status !== 'closed' && (
        <p className="text-center text-sm" style={{ color: 'var(--bh-ink-muted)' }}>
          {trOrder('expected_by', lang, { time: etaText })}
        </p>
      )}

      <div className="mt-6 ix-card p-4" style={{ background: 'var(--bh-cream-50, #F2EFEA)' }}>
        <h3 className="text-xs uppercase tracking-wide font-semibold mb-2">
          {trOrder('order_number', lang, {
            n: formatNumber(String(order.order_number).padStart(4, '0'), lang),
          })}
        </h3>
        <ul className="text-sm divide-y divide-slate-200">
          {lines.map(l => (
            <li key={l.id} className="py-2 flex justify-between">
              <span>
                {formatNumber(l.quantity, lang)} × {l.item_name_snapshot}
                {l.modifier_snapshot.length > 0 && (
                  <span className="block text-xs text-slate-500">
                    {l.modifier_snapshot.map(m => `+ ${m.name_localized}`).join(', ')}
                  </span>
                )}
                {l.notes && <span className="block text-xs italic text-slate-500">&quot;{l.notes}&quot;</span>}
              </span>
              <span>{formatPrice(Number(l.line_total_usd), lang)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 pt-3 border-t font-semibold flex justify-between">
          <span>{trOrder('total', lang)}</span>
          <span>{formatPrice(Number(order.total_usd), lang)}</span>
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--bh-ink-muted)' }}>
          {trOrder('charged_to_room', lang)}
        </p>
      </div>

      {canCancel && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="block mx-auto mt-4 text-sm underline text-red-600 disabled:opacity-50"
        >
          {trOrder('cancel_remaining', lang, { n: formatNumber(remaining, lang) })}
        </button>
      )}

      {(order.status === 'delivered' || order.status === 'closed') && (
        <a
          href={`/api/dine/${token}/receipt/${order.id}`}
          className="block mx-auto mt-6 text-center text-sm underline"
          style={{ color: 'var(--bh-navy)' }}
        >
          {trOrder('download_receipt', lang)}
        </a>
      )}

      <Link
        href={lang === 'en' ? `/dine/${token}` : `/dine/${token}?lang=${lang}`}
        className="block mx-auto mt-6 text-center py-3 px-4 rounded-full"
        style={{
          background: 'var(--bh-navy)',
          color: 'var(--bh-on-navy, #FAF8F4)',
          maxWidth: '16rem',
        }}
      >
        {trOrder('order_again', lang)}
      </Link>
    </div>
  );
}
