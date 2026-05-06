import Link from 'next/link';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { SetupTabs } from '../_components/setup-tabs';
import { deleteRule } from './actions';

export const dynamic = 'force-dynamic';

export default async function RulesSetupPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_email_rules')
    .select('*, accounts(email, display_name)')
    .order('priority', { ascending: true });

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rules</h1>
        <Link href="/personal/email/setup/rules/new" className="ix-btn-primary">
          <Plus size={16} /> New rule
        </Link>
      </header>
      <SetupTabs activeTab="rules" />

      <div className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium">Pri</th>
              <th className="text-left px-4 font-medium">Name</th>
              <th className="text-left px-4 font-medium">Match</th>
              <th className="text-left px-4 font-medium">→ Category</th>
              <th className="text-left px-4 font-medium">Account</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className={`border-t border-slate-100 ${!r.enabled ? 'opacity-50' : ''}`}>
                <td className="py-2.5 px-4 font-mono">{r.priority}</td>
                <td className="px-4">
                  <Link href={`/personal/email/setup/rules/${r.id}`} className="hover:underline">{r.name}</Link>
                </td>
                <td className="px-4 font-mono text-xs">
                  {r.match_type}={r.match_value}
                </td>
                <td className="px-4">{r.target_category}</td>
                <td className="px-4 text-xs text-slate-500">
                  {r.accounts?.display_name ?? r.accounts?.email ?? 'all'}
                </td>
                <td className="px-4 text-right">
                  <Link href={`/personal/email/setup/rules/${r.id}`} className="ix-link mr-2"><Pencil size={14}/></Link>
                  <form action={deleteRule.bind(null, r.id)} className="inline">
                    <button type="submit" className="ix-link text-rose-700"><Trash2 size={14}/></button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
