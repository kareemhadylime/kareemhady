'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, ExternalLink, MapPin, Phone, Mail, StickyNote, Package, Truck, Tag } from 'lucide-react';
import type { KikaOrderDetail } from './order-detail-types';

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: number;
  orderName: string;
};

const fmt = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

function StatusPill({ status }: { status: string | null }) {
  const s = (status || '').toLowerCase();
  const color =
    s === 'paid' || s === 'fulfilled'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : s === 'pending'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : s === 'refunded' || s === 'partially_refunded'
          ? 'bg-rose-50 text-rose-700 ring-rose-200'
          : s === 'cancelled' || s === 'voided'
            ? 'bg-slate-200 text-slate-700 ring-slate-300 line-through decoration-slate-400'
            : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded ring-1 ring-inset capitalize text-[11px] font-medium ${color}`}
    >
      {(status || 'unknown').replace(/_/g, ' ')}
    </span>
  );
}

function formatAddress(addr: KikaOrderDetail['shipping_address']): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const name = addr.name ||
    [addr.first_name, addr.last_name].filter(Boolean).join(' ');
  if (name) lines.push(name);
  if (addr.company) lines.push(addr.company);
  if (addr.address1) lines.push(addr.address1);
  if (addr.address2) lines.push(addr.address2);
  const cityLine = [addr.city, addr.province, addr.zip].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  return lines;
}

export function OrderDetailModal({ open, onClose, orderId, orderName }: Props) {
  const [data, setData] = useState<KikaOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/kika/orders/${orderId}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return (await r.json()) as KikaOrderDetail;
      })
      .then(d => {
        if (cancelled) return;
        setData(d);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const shipAddr = data?.shipping_address ?? data?.billing_address ?? null;
  const shipLines = formatAddress(shipAddr);
  const shopifyAdminUrl =
    data?.shop_domain && data.id
      ? `https://${data.shop_domain}/admin/orders/${data.id}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Order ${orderName} details`}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                Order {data?.name || orderName}
              </h2>
              {shopifyAdminUrl && (
                <a
                  href={shopifyAdminUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                  title="Open in Shopify admin"
                >
                  Shopify <ExternalLink size={12} />
                </a>
              )}
            </div>
            {data?.created_at && (
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(data.created_at).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading order…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          {data && (
            <>
              <section className="flex flex-wrap items-center gap-2">
                <StatusPill status={data.financial_status} />
                <StatusPill
                  status={
                    data.cancelled_at ||
                    data.financial_status === 'voided' ||
                    data.fulfillment_status === 'cancelled'
                      ? 'cancelled'
                      : data.fulfillment_status || 'unfulfilled'
                  }
                />
                {data.cancelled_at && (
                  <span className="text-[11px] text-slate-500">
                    cancelled {new Date(data.cancelled_at).toLocaleDateString('en-US')}
                  </span>
                )}
                {data.tags && data.tags.length > 0 && data.tags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300"
                  >
                    <Tag size={10} /> {t}
                  </span>
                ))}
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="ix-card p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </h3>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {data.customer_name || '—'}
                  </p>
                  {data.email && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Mail size={12} className="text-slate-400" />
                      <a className="ix-link" href={`mailto:${data.email}`}>{data.email}</a>
                    </p>
                  )}
                  {data.phone && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Phone size={12} className="text-slate-400" />
                      <a className="ix-link" href={`tel:${data.phone}`}>{data.phone}</a>
                    </p>
                  )}
                </div>

                <div className="ix-card p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <MapPin size={12} /> Ship to
                  </h3>
                  {shipLines.length === 0 ? (
                    <p className="text-xs text-slate-500">No shipping address on file.</p>
                  ) : (
                    <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      {shipLines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                      {shipAddr?.phone && shipAddr.phone !== data.phone && (
                        <div className="text-slate-500 mt-1 flex items-center gap-1.5">
                          <Phone size={11} /> {shipAddr.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="ix-card p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Package size={14} className="text-indigo-600" />
                  Line items
                  <span className="text-xs font-normal text-slate-500">
                    ({data.line_items.length})
                  </span>
                </h3>
                {data.line_items.length === 0 ? (
                  <p className="text-xs text-slate-500">No line items recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="text-left py-1">Product</th>
                          <th className="text-right py-1">Qty</th>
                          <th className="text-right py-1">Price</th>
                          <th className="text-right py-1">Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.line_items.map(li => (
                          <tr key={li.id} className="border-t border-slate-100 dark:border-slate-800 align-top">
                            <td className="py-1.5 pr-2">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {li.title || li.name || '—'}
                              </div>
                              {li.name && li.title && li.name !== li.title && (
                                <div className="text-[11px] text-slate-500">{li.name}</div>
                              )}
                              {li.sku && (
                                <div className="text-[11px] text-slate-400 font-mono">SKU {li.sku}</div>
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{li.quantity ?? '—'}</td>
                            <td className="py-1.5 text-right tabular-nums text-slate-500">
                              {li.price != null ? fmt(li.price) : '—'}
                            </td>
                            <td className="py-1.5 text-right tabular-nums font-medium">
                              {li.line_total != null ? fmt(li.line_total) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="ix-card p-4 space-y-2">
                <h3 className="text-sm font-semibold">Totals ({data.currency || 'EGP'})</h3>
                <dl className="text-sm space-y-1">
                  <Row label="Subtotal" value={fmt(data.subtotal)} />
                  {data.total_discounts != null && data.total_discounts > 0 && (
                    <Row
                      label="Discounts"
                      value={`-${fmt(data.total_discounts)}`}
                      tone="text-rose-600"
                    />
                  )}
                  {data.total_shipping != null && data.total_shipping > 0 && (
                    <Row label="Shipping" value={fmt(data.total_shipping)} />
                  )}
                  {data.total_tax != null && data.total_tax > 0 && (
                    <Row label="Tax" value={fmt(data.total_tax)} />
                  )}
                  <Row label="Total" value={fmt(data.total)} emphasis />
                  {data.refunded_amount != null && data.refunded_amount > 0 && (
                    <Row
                      label="Refunded"
                      value={`-${fmt(data.refunded_amount)}`}
                      tone="text-rose-600"
                    />
                  )}
                </dl>
                {data.discount_codes.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500 mb-1">Discount codes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {data.discount_codes.map((d, i) => (
                        <span
                          key={`${d.code}-${i}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px]"
                        >
                          <Tag size={10} /> {d.code}
                          {d.amount != null && <span className="text-amber-600">−{fmt(d.amount)}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {data.payment_gateways.length > 0 && (
                  <p className="text-[11px] text-slate-500 pt-1">
                    Payment: {data.payment_gateways.join(', ')}
                  </p>
                )}
              </section>

              {data.fulfillments.length > 0 && (
                <section className="ix-card p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Truck size={14} className="text-indigo-600" /> Fulfillments
                  </h3>
                  <ul className="text-xs space-y-2">
                    {data.fulfillments.map((f, i) => (
                      <li key={f.id ?? i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusPill status={f.status} />
                          {f.created_at && (
                            <span className="text-slate-500">
                              {new Date(f.created_at).toLocaleString('en-US', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          )}
                        </div>
                        {(f.tracking_number || f.tracking_company) && (
                          <div className="mt-1 text-slate-600 dark:text-slate-300">
                            {f.tracking_company && <span>{f.tracking_company} </span>}
                            {f.tracking_url ? (
                              <a
                                href={f.tracking_url}
                                target="_blank"
                                rel="noreferrer"
                                className="ix-link"
                              >
                                {f.tracking_number}
                              </a>
                            ) : (
                              <span className="font-mono">{f.tracking_number}</span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.note && (
                <section className="ix-card p-4 space-y-1">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <StickyNote size={14} className="text-amber-600" /> Notes
                  </h3>
                  <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {data.note}
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${emphasis ? 'pt-1 border-t border-slate-100 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
      <dt className="text-xs">{label}</dt>
      <dd className={`tabular-nums ${tone || ''}`}>{value}</dd>
    </div>
  );
}
