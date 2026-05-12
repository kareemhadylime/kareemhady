import { supabaseAdmin } from '@/lib/supabase';
import { ImportDropzone } from '../_components/import-dropzone';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const client = supabaseAdmin();
  const ups = await client.from('personal_stock_uploads').select('*').order('uploaded_at', { ascending: false }).limit(50);
  const accs = await client.from('personal_stock_accounts').select('id, code');
  const acct = new Map((accs.data ?? []).map((a) => [a.id, a.code] as const));

  return (
    <div className="space-y-4">
      <ImportDropzone />

      <div className="ix-card p-3">
        <div className="text-sm font-semibold mb-2">Past uploads</div>
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Filename</th>
              <th className="px-2 py-1.5 text-left">Acct</th>
              <th className="px-2 py-1.5 text-left">Year</th>
              <th className="px-2 py-1.5 text-right">Rows</th>
              <th className="px-2 py-1.5 text-left">Status</th>
              <th className="px-2 py-1.5 text-left">Uploaded at</th>
            </tr>
          </thead>
          <tbody>
            {(ups.data ?? []).map((u) => (
              <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1">{u.filename}</td>
                <td className="px-2 py-1">{acct.get(u.account_id) ?? '?'}</td>
                <td className="px-2 py-1">{u.year}</td>
                <td className="px-2 py-1 text-right">{u.row_count}</td>
                <td className={`px-2 py-1 ${u.status === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {u.status}{u.status_note ? ` (${u.status_note})` : ''}
                </td>
                <td className="px-2 py-1 text-slate-500">{u.uploaded_at?.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ix-card p-3">
        <div className="text-sm font-semibold mb-2">One-time seed</div>
        <p className="text-xs text-slate-500 mb-2">
          Reads the AOLB folder (env: <code>STOCK_AOLB_SEED_PATH</code>) and imports any unimported files.
        </p>
        <form action="/api/personal/stocks/seed" method="post">
          <button type="submit" className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded hover:bg-slate-800">
            Seed from AOLB folder
          </button>
        </form>
      </div>
    </div>
  );
}
