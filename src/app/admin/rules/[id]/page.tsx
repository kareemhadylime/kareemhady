import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { RuleForm } from '../_form';
import { updateRule } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: rule }, { data: accounts }] = await Promise.all([
    sb.from('rules').select('*').eq('id', id).single(),
    sb.from('accounts').select('id, email').order('email'),
  ]);
  if (!rule) notFound();

  const updateWithId = updateRule.bind(null, id);

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-8">
      <nav className="text-sm">
        <Link href="/admin/rules" className="text-blue-600 hover:underline">
          ← Rules
        </Link>
      </nav>
      <header>
        <h1 className="text-3xl font-bold">Edit rule</h1>
      </header>
      <RuleForm
        action={updateWithId}
        initial={{
          name: rule.name,
          account_id: rule.account_id,
          conditions: rule.conditions,
          actions: rule.actions,
          enabled: rule.enabled,
          priority: rule.priority,
        }}
        accounts={accounts || []}
        submitLabel="Save changes"
      />
    </main>
  );
}
