'use client';

import { useMemo, useState } from 'react';
import {
  Factory,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileDown,
  Package,
} from 'lucide-react';
import Link from 'next/link';
import type { ManufacturingRow } from '@/lib/kika-manufacturing';
import { VariantOrdersPopup } from './variant-orders-popup';

type Props = {
  rows: ManufacturingRow[];
  totals: {
    total_open_units: number;
    total_net_to_make: number;
    distinct_variants: number;
    distinct_products: number;
    open_order_count: number;
  };
  fromDate: string;
  toDate: string;
  label: string;
  closeHref: string;
};

type SortKey =
  | 'product'
  | 'variant'
  | 'sku'
  | 'open_qty'
  | 'in_stock'
  | 'net_to_make'
  | 'order_count'
  | 'oldest_age_days';
type SortDir = 'asc' | 'desc';

const fmt = (n: number): string => n.toLocaleString('en-US');

function SortHeader({
  label,
  k,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  align?: 'left' | 'right';
  active: boolean;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 ${
          align === 'right' ? 'flex-row-reverse' : ''
        } font-medium text-[10px] uppercase tracking-wide hover:text-slate-900 dark:hover:text-slate-100 ${
          active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500'
        }`}
      >
        <Icon size={12} />
        <span>{label}</span>
      </button>
    </th>
  );
}

export function ManufacturingDrilldown({
  rows,
  totals,
  fromDate,
  toDate,
  label,
  closeHref,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('net_to_make');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // Which row's Orders popup is open. Null = none. Keyed by row index so
  // re-sorting doesn't lose the open popup (the index changes, but since
  // the popup is closed before the user re-sorts, this is fine).
  const [openRow, setOpenRow] = useState<ManufacturingRow | null>(null);

  function clickSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      // Numeric columns default to desc; text columns default to asc.
      setSortDir(
        ['open_qty', 'in_stock', 'net_to_make', 'order_count', 'oldest_age_days'].includes(k)
          ? 'desc'
          : 'asc'
      );
    }
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case 'product':
          return a.product_title.localeCompare(b.product_title) * dir;
        case 'variant':
          return (a.variant_title || '').localeCompare(b.variant_title || '') * dir;
        case 'sku':
          return (a.sku || '').localeCompare(b.sku || '') * dir;
        case 'open_qty':
          return (a.open_qty - b.open_qty) * dir;
        case 'in_stock':
          return (a.in_stock - b.in_stock) * dir;
        case 'net_to_make':
          return (a.net_to_make - b.net_to_make) * dir;
        case 'order_count':
          return (a.order_count - b.order_count) * dir;
        case 'oldest_age_days':
          return ((a.oldest_age_days ?? -1) - (b.oldest_age_days ?? -1)) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const pdfHref = `/api/kika/manufacturing-report?from=${encodeURIComponent(
    fromDate
  )}&to=${encodeURIComponent(toDate)}&label=${encodeURIComponent(label)}`;

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
            <Factory size={14} /> Manufacturing plan — products to make
          </h3>
          <p className="text-[11px] text-slate-500">
            {fmt(totals.distinct_variants)} variant{totals.distinct_variants === 1 ? '' : 's'}{' '}
            · {fmt(totals.distinct_products)} product{totals.distinct_products === 1 ? '' : 's'}{' '}
            · {fmt(totals.total_open_units)} open units · {fmt(totals.total_net_to_make)} net to
            make · across {fmt(totals.open_order_count)} unfulfilled orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
          >
            <FileDown size={13} /> Export A4 PDF
          </a>
          <Link
            href={closeHref || '#'}
            scroll={false}
            className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 border border-slate-200 rounded-full px-2.5 py-1 hover:bg-slate-50"
          >
            Close ×
          </Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          Nothing open in this period — no manufacturing required.
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-slate-500">
              <tr>
                <th className="px-3 py-2 w-14"></th>
                <SortHeader label="Product" k="product" active={sortKey === 'product'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="Variant" k="variant" active={sortKey === 'variant'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="SKU" k="sku" active={sortKey === 'sku'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="Open qty" k="open_qty" align="right" active={sortKey === 'open_qty'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="In stock" k="in_stock" align="right" active={sortKey === 'in_stock'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="Net to make" k="net_to_make" align="right" active={sortKey === 'net_to_make'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="Orders" k="order_count" align="right" active={sortKey === 'order_count'} dir={sortDir} onClick={clickSort} />
                <SortHeader label="Oldest" k="oldest_age_days" align="right" active={sortKey === 'oldest_age_days'} dir={sortDir} onClick={clickSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr
                  key={`${r.product_id}:${r.variant_id ?? 0}`}
                  className="border-t border-slate-100 dark:border-slate-800 align-top"
                >
                  <td className="px-3 py-2">
                    <Thumb src={r.image_url} alt={r.product_title} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {r.product_title}
                    </div>
                    {r.short_description && (
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 max-w-[320px]">
                        {r.short_description.slice(0, 140)}
                        {r.short_description.length > 140 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {r.variant_title || '—'}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-500">
                    {r.sku || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.open_qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {fmt(r.in_stock)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      r.net_to_make > 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-400'
                    }`}
                  >
                    {fmt(r.net_to_make)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => setOpenRow(r)}
                      className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500/40 rounded-sm"
                      title="Click to see which orders contain this variant"
                    >
                      {r.order_count}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[11px] text-slate-500">
                    {r.oldest_age_days != null ? `${r.oldest_age_days}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <VariantOrdersPopup
        open={openRow !== null}
        onClose={() => setOpenRow(null)}
        productTitle={openRow?.product_title ?? ''}
        variantTitle={openRow?.variant_title ?? null}
        sku={openRow?.sku ?? null}
        imageUrl={openRow?.image_url ?? null}
        orders={openRow?.orders ?? []}
        totalQty={openRow?.open_qty ?? 0}
      />
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
