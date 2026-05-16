'use client';

import React, { useState } from 'react';
import { Boxes, ChevronDown, ChevronRight } from 'lucide-react';
import type { PickerBucket } from '@/lib/kika-picker';
import { OrderNumberButton } from '@/app/emails/kika/exec/_components/order-number-button';

const fmt = (n: number): string => n.toLocaleString('en-US');

export function BucketsBlock({ buckets }: { buckets: PickerBucket[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(key: 1 | 2 | 3 | 4) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (buckets.length === 0) {
    return (
      <section className="ix-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Boxes size={14} className="text-indigo-600" />
          Fulfillment buckets
        </h3>
        <p className="text-sm text-slate-500 mt-2">
          Nothing open in this scope — no picker work to do.
        </p>
      </section>
    );
  }

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Boxes size={14} className="text-indigo-600" />
          Fulfillment buckets — orders by SKU count
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Click a row to see the orders in that bucket.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Bucket</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Total units</th>
              <th className="px-4 py-2 text-right">Oldest</th>
              <th className="px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const isOpen = expanded.has(b.key);
              const pillTone =
                b.key >= 4
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-indigo-50 text-indigo-700';
              return (
                <React.Fragment key={b.key}>
                  <tr
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                    onClick={() => toggle(b.key)}
                  >
                    <td className="px-4 py-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-semibold ${pillTone}`}>
                        {b.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold">
                      {fmt(b.total_orders)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {fmt(b.total_units)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[11px] text-slate-500">
                      {b.oldest_age_days != null ? `${b.oldest_age_days}d` : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-4 py-3">
                        <ul className="space-y-2">
                          {b.orders.map(o => (
                            <li
                              key={o.id}
                              className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                            >
                              <OrderNumberButton orderId={o.id} orderName={o.name} />
                              <span className="text-slate-700 font-medium">
                                {o.customer_name || o.email || '—'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {o.age_days != null ? `${o.age_days}d` : ''}
                              </span>
                              <span className="text-[11px] text-slate-500 w-full">
                                {o.lines.map((ln, i) => (
                                  <span key={i}>
                                    {i > 0 && <span className="text-slate-300 mx-1.5">·</span>}
                                    {ln.qty}× {ln.product_title}
                                    {ln.variant_title && (
                                      <span className="text-slate-400"> ({ln.variant_title})</span>
                                    )}
                                    {ln.sku && (
                                      <span className="font-mono text-slate-400"> {ln.sku}</span>
                                    )}
                                  </span>
                                ))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
