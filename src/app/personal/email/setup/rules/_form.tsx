import { CATEGORIES } from '@/lib/personal-email/categories';
import { MATCH_TYPES } from '@/lib/personal-email/schema';
import { supabaseAdmin } from '@/lib/supabase';
import { saveRule } from './actions';

export async function RuleForm({ rule }: { rule?: any }) {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb
    .from('accounts').select('id, email, display_name')
    .eq('domain', 'personal').order('email');

  return (
    <form action={saveRule} className="space-y-4 max-w-xl">
      {rule?.id && <input type="hidden" name="id" value={rule.id} />}
      <Field label="Priority (lower = higher precedence)">
        <input name="priority" type="number" defaultValue={rule?.priority ?? 100} className="ix-input" required />
      </Field>
      <Field label="Name">
        <input name="name" type="text" defaultValue={rule?.name ?? ''} className="ix-input" required />
      </Field>
      <Field label="Match type">
        <select name="match_type" defaultValue={rule?.match_type ?? 'from_domain'} className="ix-input">
          {MATCH_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label="Match value">
        <input name="match_value" type="text" defaultValue={rule?.match_value ?? ''} className="ix-input" required />
      </Field>
      <Field label="Target category">
        <select name="target_category" defaultValue={rule?.target_category ?? 'notifications'} className="ix-input">
          {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.displayName}</option>)}
        </select>
      </Field>
      <Field label="Account (optional — empty = all)">
        <select name="account_id" defaultValue={rule?.account_id ?? ''} className="ix-input">
          <option value="">All personal accounts</option>
          {(accounts ?? []).map((a: any) => (
            <option key={a.id} value={a.id}>{a.display_name ?? a.email}</option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} />
        <span className="text-sm">Enabled</span>
      </label>
      <button type="submit" className="ix-btn-primary">Save</button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
