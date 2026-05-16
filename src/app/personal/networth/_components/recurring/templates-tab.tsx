'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Play } from 'lucide-react';
import {
  AddRecurringModal,
  type LiabilityOption,
  type RecurringEditing,
} from '../modals/add-recurring-modal';

type Frequency = 'monthly' | 'quarterly' | 'yearly';
type Currency = 'EGP' | 'USD' | 'EUR' | 'SAR' | 'AED';
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

type Template = {
  id: string;
  name: string;
  category: Category;
  amount: number;
  currency: Currency;
  frequency: Frequency;
  day_of_period: number;
  month_of_year: number | null;
  liability_id: string | null;
  notes: string | null;
  next_run_date: string;
  active: boolean;
  personal_networth_liabilities: { name: string } | null;
};

const CATEGORY_LABEL: Record<Category, string> = {
  loan_payment: 'Loan payment',
  card_payment: 'Card payment',
  overdraft_payment: 'Overdraft payment',
  bnpl_payment: 'BNPL payment',
  charity: 'Charity',
  rent: 'Rent',
  utility: 'Utility',
  phone: 'Phone',
  subscription: 'Subscription',
  insurance: 'Insurance',
  school_fee: 'School fee',
  other: 'Other',
};

const FREQ_LABEL: Record<Frequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

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

export function TemplatesTab({ liabilities }: { liabilities: LiabilityOption[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoadErr(null);
    const res = await fetch('/api/personal/networth/recurring', {
      cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      setLoadErr(json.error ?? 'Failed to load templates.');
      setLoading(false);
      return;
    }
    setTemplates(json.templates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const editingTemplate: RecurringEditing | null = useMemo(() => {
    if (!editingId) return null;
    const t = templates.find(x => x.id === editingId);
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      amount: Number(t.amount),
      currency: t.currency,
      frequency: t.frequency,
      day_of_period: t.day_of_period,
      month_of_year: t.month_of_year,
      liability_id: t.liability_id,
      notes: t.notes,
    };
  }, [editingId, templates]);

  async function onToggle(id: string) {
    const res = await fetch(`/api/personal/networth/recurring/${id}/toggle`, {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      alert(`Toggle failed: ${json.error ?? 'unknown'}`);
      return;
    }
    setTemplates(prev =>
      prev.map(t => (t.id === id ? { ...t, active: json.active } : t)),
    );
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This soft-deletes the template (active=false).`)) {
      return;
    }
    const res = await fetch(`/api/personal/networth/recurring/${id}`, {
      method: 'DELETE',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      alert(`Delete failed: ${json.error ?? 'unknown'}`);
      return;
    }
    await fetchTemplates();
    router.refresh();
  }

  async function onRunNow() {
    setRunning(true);
    setRunMsg(null);
    const res = await fetch('/api/personal/networth/recurring/run-now', {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok || !json.ok) {
      setRunMsg(`Run failed: ${json.error ?? 'unknown'}`);
      return;
    }
    const processed = Number(json.processed ?? 0);
    const errors =
      Array.isArray(json.results)
        ? json.results.filter((r: { error?: string }) => r.error).length
        : 0;
    setRunMsg(
      errors > 0
        ? `Processed ${processed} due template(s), ${errors} error(s).`
        : `Processed ${processed} due template(s).`,
    );
    await fetchTemplates();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {loading ? 'Loading…' : `${templates.length} template(s)`}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRunNow}
            disabled={running}
            className="ix-btn-secondary disabled:opacity-50"
            title="Run today's due templates"
          >
            <Play size={14} />
            {running ? 'Running…' : "Run today's due"}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ix-btn-primary"
          >
            <Plus size={16} />
            Add recurring
          </button>
        </div>
      </div>

      {runMsg && (
        <div className="ix-card p-3 text-xs text-slate-700 dark:text-slate-200">
          {runMsg}
        </div>
      )}

      {loadErr && (
        <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded px-2 py-1.5">
          {loadErr}
        </div>
      )}

      <div className="ix-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Frequency</th>
                <th className="px-3 py-2">Next run</th>
                <th className="px-3 py-2">Linked liability</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr
                  key={t.id}
                  className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                    {t.name}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {CATEGORY_LABEL[t.category] ?? t.category}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtAmount(Number(t.amount), t.currency)}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {FREQ_LABEL[t.frequency] ?? t.frequency}
                    <span className="text-[11px] text-slate-400 ml-1">
                      · day {t.day_of_period}
                      {t.frequency === 'yearly' && t.month_of_year
                        ? `, mo ${t.month_of_year}`
                        : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 tabular-nums">
                    {t.next_run_date}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {t.personal_networth_liabilities?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onToggle(t.id)}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium transition ${
                        t.active
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                      title="Toggle active"
                    >
                      {t.active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(t.id)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t.id, t.name)}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && templates.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-sm text-slate-400 italic"
                  >
                    No recurring templates yet. Add your first one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddRecurringModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          fetchTemplates();
          router.refresh();
        }}
        liabilities={liabilities}
      />
      <AddRecurringModal
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          fetchTemplates();
          router.refresh();
        }}
        liabilities={liabilities}
        editing={editingTemplate}
      />
    </div>
  );
}
