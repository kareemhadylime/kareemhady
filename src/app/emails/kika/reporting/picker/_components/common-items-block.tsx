'use client';

import React, { useState } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import type { PickerCommonItem } from '@/lib/kika-picker';

const fmt = (n: number): string => n.toLocaleString('en-US');

export function CommonItemsBlock({ items }: { items: PickerCommonItem[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <section className="ix-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package size={14} className="text-indigo-600" />
          Most common items in unfulfilled orders
        </h3>
        <p className="text-sm text-slate-500 mt-2">No items to surface in this scope.</p>
      </section>
    );
  }

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package size={14} className="text-indigo-600" />
          Most common items in unfulfilled orders
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Click a product to expand its variants underneath.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 w-12"></th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Variants</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => {
              const isOpen = expanded.has(p.product_id);
              return (
                <React.Fragment key={p.product_id}>
                  <tr
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                    onClick={() => toggle(p.product_id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle(p.product_id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-expanded={isOpen}
                    aria-label={`${p.product_title} — ${p.total_orders} orders, click to ${isOpen ? 'collapse' : 'expand'}`}
                  >
                    <td className="px-3 py-2">
                      <Thumb src={p.image_url} alt={p.product_title} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{p.product_title}</div>
                      {p.short_description && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 max-w-[460px]">
                          {p.short_description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {fmt(p.total_orders)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(p.total_units)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {p.variants.length}
                    </td>
                    <td className="px-3 py-2 text-slate-400" aria-hidden="true">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                  </tr>
                  {isOpen && p.variants.map(v => (
                    <tr
                      key={`${p.product_id}-${v.variant_id ?? 'none'}`}
                      className="bg-indigo-50/40"
                    >
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1 pl-10 text-[12px] text-slate-700">
                        <span>{v.variant_title || '—'}</span>
                        {v.sku && (
                          <span className="ml-2 font-mono text-[11px] text-slate-400">SKU {v.sku}</span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-700">{fmt(v.orders)}</td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-700">{fmt(v.units)}</td>
                      <td className="px-3 py-1"></td>
                      <td className="px-3 py-1"></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div
        className="w-10 h-10 rounded-md bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center text-slate-400"
        aria-hidden="true"
      >
        <Package size={14} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={40}
      height={40}
      loading="lazy"
      className="w-10 h-10 rounded-md object-cover ring-1 ring-slate-200 dark:ring-slate-700 bg-slate-50"
    />
  );
}
