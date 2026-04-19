import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
import { RuleForm } from '../_form';
import { createRule } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewRulePage() {
  const sb = supabaseAdmin();
  const { data: accounts } = await sb.from('accounts').select('id, email').order('email');

  return (
    <>
      <TopNav>
        <Link href="/admin" className="ix-link">Admin</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin/rules" className="ix-link">Rules</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>New</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Admin · Email rules
          </p>
          <h1 className="text-3xl font-bold tracking-tight">New rule</h1>
        </header>
        <RuleForm
          action={createRule}
          initial={{}}
          accounts={accounts || []}
          submitLabel="Create rule"
        />
      </main>
    </>
  );
}
