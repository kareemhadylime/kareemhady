import Link from 'next/link';

export type RuleFormValues = {
  name?: string;
  account_id?: string | null;
  conditions?: {
    from_contains?: string;
    subject_contains?: string;
    to_contains?: string;
    time_window_hours?: number;
  };
  actions?: { type?: string; currency?: string };
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
          className="w-full border rounded px-3 py-2"
          placeholder="KIKA Shopify Orders (last 24h)"
        />
      </Field>

      <Field label="Account">
        <select
          name="account_id"
          defaultValue={initial.account_id || 'all'}
          className="w-full border rounded px-3 py-2"
        >
          <option value="all">All accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Time window (hours)">
        <input
          type="number"
          name="time_window_hours"
          min={1}
          defaultValue={cond.time_window_hours ?? 24}
          className="w-full border rounded px-3 py-2"
        />
      </Field>

      <fieldset className="space-y-4 border rounded p-4">
        <legend className="text-sm font-semibold px-1">Filters (all must match)</legend>
        <Field label="From contains">
          <input
            name="from_contains"
            defaultValue={cond.from_contains || ''}
            className="w-full border rounded px-3 py-2"
            placeholder="kika"
          />
        </Field>
        <Field label="Subject contains">
          <input
            name="subject_contains"
            defaultValue={cond.subject_contains || ''}
            className="w-full border rounded px-3 py-2"
            placeholder="Order"
          />
        </Field>
        <Field label="To contains (optional)">
          <input
            name="to_contains"
            defaultValue={cond.to_contains || ''}
            className="w-full border rounded px-3 py-2"
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 border rounded p-4">
        <legend className="text-sm font-semibold px-1">Action</legend>
        <Field label="Type">
          <select
            name="action_type"
            defaultValue={act.type || 'shopify_order_aggregate'}
            className="w-full border rounded px-3 py-2"
          >
            <option value="shopify_order_aggregate">Shopify order aggregate</option>
          </select>
        </Field>
        <Field label="Currency">
          <input
            name="currency"
            defaultValue={act.currency || 'EGP'}
            className="w-full border rounded px-3 py-2"
          />
        </Field>
      </fieldset>

      <Field label="Priority">
        <input
          type="number"
          name="priority"
          defaultValue={initial.priority ?? 100}
          className="w-full border rounded px-3 py-2"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial.enabled !== false}
        />
        Enabled
      </label>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="px-4 py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          {submitLabel}
        </button>
        <Link
          href="/admin/rules"
          className="px-4 py-2 rounded border font-medium hover:bg-gray-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
