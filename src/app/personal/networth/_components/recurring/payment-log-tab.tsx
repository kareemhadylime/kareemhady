'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, Filter, Trash2 } from 'lucide-react';
import { AddPaymentModal } from '../modals/add-payment-modal';

type Category =
  | 'loan_payment'
  | 'card_payment'
  | 'overdraft_payment'
  | 'bnpl_payment'
  | 'charity'
  | 'rent'
  | 'utility'
  | 'phone'
  | 'subscription'
  | 'insurance'
  | 'school_fee'
  | 'other';

type Payment = {
  id: string;
  occurred_on: string;
  amount: number | string;
  currency: string;
  category: Category;
  liability_id: string | null;
  loan_schedule_id: string | null;
  notes: string | null;
  personal_networth_liabilities?: { name?: string } | null;
};

type Liability = { id: string; name: string };

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'loan_payment', label: 'Loan payment' },
  { value: 'card_payment', label: 'Card payment' },
  { value: 'overdraft_payment', label: 'Overdraft payment' },
  { value: 'bnpl_payment', label: 'BNPL payment' },
  { value: 'charity', label: 'Charity' },
  { value: 'rent', label: 'Rent' },
  { value: 'utility', label: 'Utility' },
  { value: 'phone', label: 'Phone' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'school_fee', label: 'School fee' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.value, c.label]),
) as Record<Category, string>;

function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}

export function PaymentLogTab() {
  // Filter state — applied to fetch only on "Apply filters".
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(cairoToday());
  const [category, setCategory] = useState<'' | Category>('');
  const [liabilityId, setLiabilityId] = useState('');
  const [search, setSearch] = useState('');

  // Applied (committed) filters drive the fetch + CSV URL.
  const [appliedFrom, setAppliedFrom] = useState(from);
  const [appliedTo, setAppliedTo] = useState(to);
  const [appliedCategory, setAppliedCategory] = useState<'' | Category>('');
  const [appliedLiabilityId, setAppliedLiabilityId] = useState('');

  const [payments, setPayments] = useState<Payment[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const qs = new URLSearchParams();
    if (appliedFrom) qs.set('from', appliedFrom);
    if (appliedTo) qs.set('to', appliedTo);
    if (appliedCategory) qs.set('category', appliedCategory);
    if (appliedLiabilityId) qs.set('liabilityId', appliedLiabilityId);
    const res = await fetch(`/api/personal/networth/payments?${qs.toString()}`, {
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || !json.ok) {
      setLoadErr(json.error ?? 'Failed to load payments.');
      return;
    }
    setPayments(json.payments ?? []);
  }, [appliedFrom, appliedTo, appliedCategory, appliedLiabilityId]);

  // Liabilities are loaded once for the filter + Add Payment dropdowns.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/personal/networth/liabilities', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok && json.ok && Array.isArray(json.liabilities)) {
        setLiabilities(
          json.liabilities.map((l: { id: string; name: string }) => ({
            id: l.id,
            name: l.name,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  async function deletePayment(p: Payment) {
    const msg = p.loan_schedule_id
      ? 'Delete this payment? The linked schedule row will revert to unpaid. Liability balance is NOT auto-restored — adjust manually if needed.'
      : 'Delete this payment?';
    if (!window.confirm(msg)) return;
    setDeleting(p.id);
    const res = await fetch(`/api/personal/networth/payments/${p.id}`, {
      method: 'DELETE',
    });
    const json = await res.json().catch(() => ({}));
    setDeleting(null);
    if (!res.ok || !json.ok) {
      setLoadErr(json.error ?? 'Failed to delete payment.');
      return;
    }
    fetchPayments();
  }

  function onApply() {
    setAppliedFrom(from);
    setAppliedTo(to);
    setAppliedCategory(category);
    setAppliedLiabilityId(liabilityId);
  }

  const csvUrl = useMemo(() => {
    const qs = new URLSearchParams();
    if (appliedFrom) qs.set('from', appliedFrom);
    if (appliedTo) qs.set('to', appliedTo);
    if (appliedCategory) qs.set('category', appliedCategory);
    if (appliedLiabilityId) qs.set('liabilityId', appliedLiabilityId);
    return `/api/personal/networth/payments/export/csv?${qs.toString()}`;
  }, [appliedFrom, appliedTo, appliedCategory, appliedLiabilityId]);

  // Free-text search is a client-side filter on notes — the API doesn't
  // need to grow a LIKE param for this V1.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return payments;
    return payments.filter(p =>
      (p.notes ?? '').toLowerCase().includes(needle),
    );
  }, [payments, search]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="ix-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <Filter size={14} />
          Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">From</span>
            <input
              type="date"
              className="ix-input"
              value={from}
              onChange={e => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">To</span>
            <input
              type="date"
              className="ix-input"
              value={to}
              onChange={e => setTo(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Category</span>
            <select
              className="ix-input"
              value={category}
              onChange={e => setCategory(e.target.value as '' | Category)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Liability</span>
            <select
              className="ix-input"
              value={liabilityId}
              onChange={e => setLiabilityId(e.target.value)}
            >
              <option value="">All liabilities</option>
              {liabilities.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 text-slate-600 dark:text-slate-300">Search notes</span>
            <input
              type="search"
              className="ix-input"
              placeholder="free text…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onApply} className="ix-btn-secondary">
            Apply filters
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {loading ? 'Loading…' : `${visible.length} payment(s)`}
        </div>
        <div className="flex gap-2">
          <a href={csvUrl} download className="ix-btn-secondary">
            <Download size={14} />
            Export CSV
          </a>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ix-btn-primary"
          >
            <Plus size={16} />
            Add payment
          </button>
        </div>
      </div>

      {loadErr && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
          {loadErr}
        </div>
      )}

      {/* Table */}
      <div className="ix-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Liability</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 tabular-nums text-slate-500 dark:text-slate-400">
                    {p.occurred_on}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                    {fmtAmount(Number(p.amount), p.currency)}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {CATEGORY_LABEL[p.category] ?? p.category}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {p.liability_id ? (
                      <a
                        href={`/personal/networth/liabilities/${p.liability_id}`}
                        className="text-indigo-600 dark:text-indigo-300 hover:underline"
                      >
                        {p.personal_networth_liabilities?.name ?? '—'}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 max-w-[24rem] truncate">
                    {p.notes ?? ''}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => deletePayment(p)}
                      disabled={deleting === p.id}
                      title="Delete payment"
                      className="text-rose-600 hover:text-rose-700 disabled:text-slate-300 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-slate-400 italic"
                  >
                    No payments match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddPaymentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          fetchPayments();
        }}
        liabilities={liabilities}
      />
    </div>
  );
}

