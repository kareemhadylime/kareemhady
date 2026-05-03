'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Loader2, Trash2, Save as SaveIcon } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import {
  adminEditExpenseAction,
  adminDeleteExpenseAction,
} from '@/app/emails/boat-rental/admin/overrides-actions';

const CATEGORIES = [
  { value: 'amenities', label: 'Amenities' },
  { value: 'part_time_skipper', label: 'Part-time skipper' },
  { value: 'marina_docking', label: 'Marina docking' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'boat_license', label: 'Boat license' },
  { value: 'full_time_skipper_salary', label: 'Full-time skipper salary' },
  { value: 'maintenance_contract', label: 'Maintenance contract' },
  { value: 'other', label: 'Other' },
];

type Props = {
  expenseId: string;
  initial: {
    category: string;
    amount_egp: number;
    expense_date: string;
    description: string | null;
    vendor_name: string | null;
    status: 'open' | 'paid' | 'cancelled';
  };
};

export function AdminExpenseOverrides({ expenseId, initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'edit' | 'delete' | null>(null);

  const [category, setCategory] = useState(initial.category);
  const [amount, setAmount] = useState(String(initial.amount_egp));
  const [date, setDate] = useState(initial.expense_date);
  const [description, setDescription] = useState(initial.description ?? '');
  const [vendor, setVendor] = useState(initial.vendor_name ?? '');
  const [status, setStatus] = useState(initial.status);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy('edit');
    try {
      const fd = new FormData();
      fd.set('id', expenseId);
      if (category !== initial.category) fd.set('category', category);
      if (Number(amount) !== initial.amount_egp) fd.set('amount_egp', amount);
      if (date !== initial.expense_date) fd.set('expense_date', date);
      if (description !== (initial.description ?? '')) fd.set('description', description);
      if (vendor !== (initial.vendor_name ?? '')) fd.set('vendor_name', vendor);
      if (status !== initial.status) fd.set('status', status);
      const result = await adminEditExpenseAction(fd);
      if (result.ok) {
        toast('Expense updated.', { kind: 'success' });
        hapticSuccess();
        // Close back to the list view.
        router.push('/emails/boat-rental/owner/money/expenses');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (busy) return;
    if (
      !confirm(
        `PERMANENTLY DELETE this expense?\n\n` +
          `• Category: ${initial.category}\n` +
          `• Amount: EGP ${initial.amount_egp.toLocaleString()}\n` +
          `• Date: ${initial.expense_date}\n` +
          `• Status: ${initial.status}\n\n` +
          `Deletes the expense AND all linked payment rows. The audit log keeps a snapshot.\n\n` +
          `This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy('delete');
    try {
      const fd = new FormData();
      fd.set('id', expenseId);
      const reason = window.prompt('Reason for deletion (recorded in audit log):') ?? '';
      fd.set('reason', reason);
      const result = await adminDeleteExpenseAction(fd);
      if (result.ok) {
        toast('Expense deleted.', { kind: 'success' });
        hapticSuccess();
        router.push('/emails/boat-rental/owner/money/expenses');
        router.refresh();
      } else {
        toast(result.error, { kind: 'error' });
        hapticError();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-6 ix-card p-5 border-amber-300 bg-amber-50/40 dark:border-amber-700 dark:bg-amber-950/30">
      <h2 className="font-semibold mb-2 text-amber-900 dark:text-amber-200 text-sm flex items-center gap-2">
        <ShieldAlert size={14} /> Admin overrides
      </h2>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mb-3">
        Edit any field directly — including status — or hard-delete the expense and all its
        payments. Every change is logged.
      </p>

      <form onSubmit={onSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="ix-input mt-1"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Amount (EGP)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'open' | 'paid' | 'cancelled')}
            className="ix-input mt-1"
          >
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-slate-600 text-xs">Vendor</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-slate-600 text-xs">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="ix-input mt-1"
          />
        </label>
        <div className="sm:col-span-2 flex justify-between items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy !== null}
            className="ix-btn-danger inline-flex items-center gap-1 disabled:opacity-60"
          >
            {busy === 'delete' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete permanently
          </button>
          <button
            type="submit"
            disabled={busy !== null}
            className="ix-btn-primary inline-flex items-center gap-1 disabled:opacity-60"
          >
            {busy === 'edit' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <SaveIcon size={14} />
            )}
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}
