import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { RuleForm } from '../_form';
import { SetupTabs } from '../../_components/setup-tabs';

export const dynamic = 'force-dynamic';

export default async function EditRulePage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: rule } = await supabaseAdmin()
    .from('personal_email_rules').select('*').eq('id', id).single();
  if (!rule) notFound();
  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">Edit rule</h1>
      <SetupTabs activeTab="rules" />
      <RuleForm rule={rule} />
    </main>
  );
}
