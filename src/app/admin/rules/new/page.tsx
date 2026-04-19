import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { RuleForm } from '../_form';
import { createRule } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewRulePage() {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb.from('accounts').select('id, email').order('email');

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/admin/rules" className="text-blue-600 hover:underline">
          ← Rules
        </Link>
      </nav>
      <header>
        <h1 className="text-3xl font-bold">New rule</h1>
      </header>
      <RuleForm
        action={createRule}
        initial={{}}
        accounts={accounts || []}
        submitLabel="Create rule"
      />
    </main>
  );
}
