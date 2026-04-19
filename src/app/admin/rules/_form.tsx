import Link from 'next/link';
import { DOMAINS, DOMAIN_LABELS } from '@/lib/rules/presets';

export type RuleFormValues = {
  name?: string;
  account_id?: string | null;
  domain?: string | null;
  conditions?: {
    from_contains?: string;
    subject_contains?: string;
    to_contains?: string;
    time_window_hours?: number;
  };
  actions?: { type?: string; currency?: string; mark_as_read?: boolean };
  enabled?: boolean;
  priority?: number;
};

export function RuleForm({
  action,
  initial,
  accounts,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  initial: RuleFormValues;
  accounts: Array<{ id: string; email: string }>;
  submitLabel: string;
}) {
  const cond = initial.conditions || {};
  const act = initial.actions || {};
  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <Field label="Name">
        <input
          name="name"
          required
          defaultValue={initial.name || ''}
          className="ix-input"
          placeholder="KIKA Shopify Orders (last 24h)"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label="Domain"
          hint="Where this rule appears under Reports & outputs."
        >
          <select
            name="domain"
            defaultValue={initial.domain || ''}
            className="ix-input"
          >
            <option value="">— Other (no domain) —</option>
            {DOMAINS.map(d => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account">
          <select
            name="account_id"
            defaultValue={initial.account_id || 'all'}
            className="ix-input"
          >
            <option value="all">All accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="ix-card p-5 space-y-4">
        <legend className="text-sm font-semibold px-2 text-slate-700">
          Filters (all must match)
        </legend>
        <Field label="From contains">
          <input
            name="from_contains"
            defaultValue={cond.from_contains || ''}
            className="ix-input"
            placeholder="kika"
          />
        </Field>
        <Field label="Subject contains">
          <input
            name="subject_contains"
            defaultValue={cond.subject_contains || ''}
            className="ix-input"
            placeholder="Order"
          />
        </Field>
        <Field label="To contains (optional)">
          <input
            name="to_contains"
            defaultValue={cond.to_contains || ''}
            className="ix-input"
          />
        </Field>
      </fieldset>

      <fieldset className="ix-card p-5 space-y-4">
        <legend className="text-sm font-semibold px-2 text-slate-700">Action</legend>
        <Field label="Type">
          <select
            name="action_type"
            defaultValue={act.type || 'shopify_order_aggregate'}
            className="ix-input"
          >
            <option value="shopify_order_aggregate">Shopify order aggregate</option>
          </select>
        </Field>
        <Field label="Currency">
          <input
            name="currency"
            defaultValue={act.currency || 'EGP'}
            className="ix-input"
          />
        </Field>
        <label className="flex items-start gap-3 text-sm pt-1">
          <input
            type="checkbox"
            name="mark_as_read"
            defaultChecked={act.mark_as_read === true}
            className="w-4 h-4 mt-0.5 accent-indigo-600"
          />
          <span>
            <span className="font-medium">Mark matched emails as read in Gmail</span>
            <span className="block text-xs text-slate-500">
              Removes the UNREAD label after each successful run. Requires the
              gmail.modify scope on the connected account.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="grid sm:grid-cols-2 gap-4 items-end">
        <Field label="Priority">
          <input
            type="number"
            name="priority"
            defaultValue={initial.priority ?? 100}
            className="ix-input"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm py-2">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={initial.enabled !== false}
            className="w-4 h-4 accent-indigo-600"
          />
          Enabled
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="ix-btn-primary">
          {submitLabel}
        </button>
        <Link href="/admin/rules" className="ix-btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
