'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface OrderRow {
  id: string;
  order_number: number;
  building_code: string;
  unit_code: string;
  guest_name: string | null;
  total_usd: number | string;
  submitted_at: string;
  fnb_order_items?: Array<unknown>;
}

export function OrderCard({ order }: { order: OrderRow }): ReactNode {
  const itemCount = order.fnb_order_items?.length ?? 0;
  return (
    <Link
      href={`/beithady/fnb/orders/${order.id}`}
      className="block bg-white dark:bg-slate-800 rounded p-3 shadow-sm hover:ring-2 hover:ring-rose-300"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-500">
          {order.building_code} · #{String(order.order_number).padStart(4, '0')}
        </span>
        <span className="font-semibold text-sm">${Number(order.total_usd).toFixed(0)}</span>
      </div>
      <p className="text-sm font-medium mt-1">
        Unit {order.unit_code}{order.guest_name ? ` · ${order.guest_name}` : ''}
      </p>
      <p className="text-xs text-slate-500 mt-0.5">
        {itemCount} item{itemCount === 1 ? '' : 's'}
      </p>
      <p className="text-xs text-slate-400 mt-1">
        {new Date(order.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
    </Link>
  );
}
