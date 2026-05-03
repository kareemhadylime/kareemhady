import { ImportUploader } from './_components/import-uploader';
import { supabaseAdmin } from '@/lib/supabase';

export default async function ImportPage() {
  const sb = supabaseAdmin();
  const { data: projects } = await sb
    .from('odoo_analytic_accounts')
    .select('id, name')
    .eq('active', true)
    .order('name');
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Import budget from Excel</h2>
      <p className="text-sm text-slate-500">
        Upload a budget XLSX. Two formats accepted: a <strong>rich AUC-style template</strong> (auto-detected by sheet names) or our <strong>flat normalized template</strong> (download below).
      </p>
      <a href="/api/fmplus/budget/flat-template-download" className="inline-block text-sm text-amber-700 hover:underline">⬇ Download blank flat template (.xlsx)</a>
      <ImportUploader projects={(projects ?? []) as Array<{ id: number; name: string }>} />
    </section>
  );
}
