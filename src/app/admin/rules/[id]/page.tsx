import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
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
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin" className="ix-link">Setup</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin/rules" className="ix-link">Rules</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span className="truncate max-w-[200px]">{rule.name}</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Setup · Email Rules · Edit
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Edit rule</h1>
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
    </>
  );
}
