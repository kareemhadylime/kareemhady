'use client';
import Link from 'next/link';
import { useCart } from './cart-store';

export function CartBar({ token }: { token: string }) {
  const { lines } = useCart();
  if (lines.length === 0) return null;
  const total = lines.reduce(
    (s, l) =>
      s + l.quantity *
        (l.unit_price_usd + l.modifiers.reduce((a, m) => a + m.price_delta_usd, 0)),
    0,
  );
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <Link href={`/dine/${token}/order`} className="dine-cart-bar">
      <span>🛒 {count} item{count !== 1 ? 's' : ''} · ${total.toFixed(0)}</span>
      <span>·</span>
      <span>View order →</span>
    </Link>
  );
}
