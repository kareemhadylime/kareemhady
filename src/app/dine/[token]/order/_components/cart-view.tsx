'use client';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart, cart } from '../../_components/cart-store';
import { computeCartTotals } from '@/lib/beithady/fnb/cart';
import { DeliveryPicker } from './delivery-picker';
import type { DineLang } from '../../_components/i18n';

export function CartView({
  token, buildingCode, unitCode, deliverySlaMinutes,
}: {
  token: string;
  buildingCode: string;
  unitCode: string;
  deliverySlaMinutes: number;
}) {
  const { lines } = useCart();
  const router = useRouter();
  const params = useSearchParams();
  const lang: DineLang = (() => {
    const raw = params.get('lang');
    return raw === 'ar' || raw === 'ru' || raw === 'fr' ? raw : 'en';
  })();
  const [delivery, setDelivery] = useState<'asap' | 30 | 60>('asap');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() =>
    computeCartTotals(
      lines.map(l => ({
        unit_price_usd: l.unit_price_usd,
        quantity: l.quantity,
        modifiers: l.modifiers,
      })),
    ),
  [lines]);

  async function submit() {
    setSubmitting(true); setErr(null);
    const idempotency_key = crypto.randomUUID();
    const requested_delivery_at = delivery === 'asap'
      ? null
      : new Date(Date.now() + Number(delivery) * 60_000).toISOString();
    const res = await fetch(`/api/dine/${token}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotency_key,
        guest_language: lang,
        requested_delivery_at,
        notes: notes || null,
        lines: lines.map(l => ({
          item_id: l.item_id,
          quantity: l.quantity,
          modifier_ids: l.modifier_ids,
          notes: l.notes || null,
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return;
    }
    const { order } = await res.json();
    cart.clear();
    // ?placed=1 triggers the thank-you banner + 15s auto-redirect on the
    // confirmation page; preserves ?lang so the menu opens in the right lang.
    const langParam = lang !== 'en' ? `&lang=${lang}` : '';
    router.push(`/dine/${token}/order/${order.id}?placed=1${langParam}`);
  }

  if (lines.length === 0) {
    return (
      <div className="text-center py-12 px-6">
        <p className="display text-2xl mb-3">Your cart is empty</p>
        <Link
          href={`/dine/${token}`}
          className="inline-block mt-2 underline"
          style={{ color: 'var(--bh-navy)' }}
        >Back to menu</Link>
      </div>
    );
  }

  return (
    <div className="px-6 pb-12">
      <h2 className="display text-2xl text-center mb-6">Your order</h2>
      <ul className="space-y-3 mb-6">
        {lines.map(l => (
          <li key={l.id} className="flex items-start gap-3 pb-3 border-b border-slate-200">
            <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <span className="dine-item-name">{l.item_name}</span>
                <span className="dine-item-price">
                  ${(l.quantity *
                      (l.unit_price_usd +
                        l.modifiers.reduce((s, m) => s + m.price_delta_usd, 0))
                    ).toFixed(0)}
                </span>
              </div>
              {l.modifiers.map(m => (
                <p key={m.id} className="text-xs text-slate-500">+ {m.name}</p>
              ))}
              {l.notes && <p className="text-xs italic text-slate-500">&ldquo;{l.notes}&rdquo;</p>}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => cart.setQty(l.id, Math.max(1, l.quantity - 1))}
                  className="w-7 h-7 rounded-full border text-sm"
                >−</button>
                <span className="text-sm">{l.quantity}</span>
                <button
                  onClick={() => cart.setQty(l.id, Math.min(10, l.quantity + 1))}
                  className="w-7 h-7 rounded-full border text-sm"
                >+</button>
                <button
                  onClick={() => cart.remove(l.id)}
                  className="ml-auto text-xs text-red-600"
                >Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <DeliveryPicker
        value={delivery}
        onChange={setDelivery}
        slaMinutes={deliverySlaMinutes}
      />

      <label className="block mt-4">
        <span className="text-xs uppercase tracking-wide font-semibold">
          Order notes (optional)
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value.slice(0, 500))}
          rows={2}
          className="w-full mt-1 rounded border p-2 text-sm"
          placeholder="Allergies, special requests…"
        />
      </label>

      <dl className="mt-6 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt><dd>${totals.subtotal_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-slate-500">
          <dt>VAT (14%, included)</dt><dd>${totals.vat_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-slate-500">
          <dt>Service (12%, included)</dt><dd>${totals.service_usd.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold mt-2 pt-2 border-t">
          <dt>Total</dt><dd>${totals.total_usd.toFixed(2)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-center" style={{ color: 'var(--bh-ink-muted)' }}>
        Charged to {buildingCode} · Unit {unitCode} — settled at checkout
      </p>

      {err && <p className="mt-3 text-sm text-red-600 text-center">{err}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="block w-full mt-6 py-4 rounded-full text-white font-semibold disabled:opacity-50"
        style={{ background: 'var(--bh-navy)' }}
      >
        {submitting ? 'Submitting…' : `Submit order · $${totals.total_usd.toFixed(0)}`}
      </button>

      <Link
        href={`/dine/${token}`}
        className="block text-center mt-3 text-sm underline"
        style={{ color: 'var(--bh-navy)' }}
      >+ Add more items</Link>
    </div>
  );
}
