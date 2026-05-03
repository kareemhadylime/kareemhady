import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SetupTabs } from '../_components/setup-tabs';

export const dynamic = 'force-dynamic';

export default async function CorrectionsSetupPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('personal_email_corrections')
    .select('id, old_category, new_category, created_at, email_logs(subject, from_address)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-6 flex-1">
      <h1 className="text-2xl font-bold">Corrections</h1>
      <SetupTabs activeTab="corrections" />

      <p className="text-xs text-slate-500">
        Audit log of every manual reclassification. The 10 most recent per category are
        embedded as few-shot examples in the AI system prompt for the next run.
      </p>

      <div className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left py-2.5 px-3 font-medium">When</th>
              <th className="text-left px-3 font-medium">From</th>
              <th className="text-left px-3 font-medium">Subject</th>
              <th className="text-left px-3 font-medium">Old</th>
              <th className="text-left px-3 font-medium">→ New</th>
            </tr>
          </thead>
          <tbody>
            {((data ?? []) as any[]).map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-2 px-3 whitespace-nowrap text-xs">{fmtCairoDateTime(r.created_at)}</td>
                <td className="px-3 text-xs truncate max-w-xs">{r.email_logs?.from_address?.split('<')[0].trim()}</td>
                <td className="px-3 text-xs truncate max-w-md">{r.email_logs?.subject}</td>
                <td className="px-3 text-xs">{r.old_category ?? '—'}</td>
                <td className="px-3 text-xs font-semibold">{r.new_category}</td>
              </tr>
            ))}
            {!data?.length && (
              <tr><td colSpan={5} className="p-3 text-slate-500 text-center">No corrections yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
