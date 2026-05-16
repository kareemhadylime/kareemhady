'use client';

import { useEffect } from 'react';
import { X, Package } from 'lucide-react';
import type { VariantOrder } from '@/lib/kika-manufacturing';
import { OrderNumberButton } from './order-number-button';

type Props = {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  orders: VariantOrder[];
  /** Total remaining qty for this variant (sum of `orders[].qty`). */
  totalQty: number;
};

export function VariantOrdersPopup({
  open,
  onClose,
  productTitle,
  variantTitle,
  sku,
  imageUrl,
  orders,
  totalQty,
}: Props) {
  // ESC + body-scroll lock, same pattern as the order detail modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Orders containing ${productTitle}`}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl my-4 max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={productTitle}
                width={44}
                height={44}
                className="w-11 h-11 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-md bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                <Package size={16} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {productTitle}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {variantTitle && <span>{variantTitle}</span>}
                {variantTitle && sku && <span> · </span>}
                {sku && <span className="font-mono">SKU {sku}</span>}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {orders.length} order{orders.length === 1 ? '' : 's'} · {totalQty} unit
                {totalQty === 1 ? '' : 's'} open
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No orders found for this variant.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wide text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Order</th>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Placed</th>
                  <th className="text-right px-4 py-2">Age</th>
                  <th className="text-right px-4 py-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr
                    key={o.order_id}
                    className="border-t border-slate-100 dark:border-slate-800 align-top"
                  >
                    <td className="px-4 py-2 font-medium">
                      <OrderNumberButton orderId={o.order_id} orderName={o.order_name} />
                    </td>
                    <td className="px-4 py-2 truncate max-w-[200px]">
                      <div className="truncate">{o.customer_name || o.email || '—'}</div>
                      {o.customer_name && o.email && (
                        <div className="truncate text-[11px] text-slate-500">{o.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500 tabular-nums">
                      {o.created_at
                        ? new Date(o.created_at).toLocaleDateString('en-US')
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[11px] text-slate-500">
                      {o.age_days != null ? `${o.age_days}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {o.qty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
