import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { resolveIgAccountAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function InstagramAccountsPage() {
  await requireBeithadyPermission('ads', 'full');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('ads_accounts')
    .select('id, name, external_id, fb_page_id, fb_page_name, ig_business_id, ig_username, status')
    .eq('platform', 'meta')
    .order('id');
  const rows = (data as Array<{ id: number; name: string; external_id: string; fb_page_id: string | null; fb_page_name: string | null; ig_business_id: string | null; ig_username: string | null; status: string }> | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Accounts', href: '/beithady/ads/accounts' }, { label: 'Instagram' }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Instagram accounts"
        subtitle="IG Business accounts are resolved from a linked Facebook Page. Click Resolve to fetch the IG account behind a Page."
      />

      <AdsTabs active="accounts" />

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Meta accounts</h2>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No Meta accounts yet. Configure provider <code>meta_marketing</code> under <Link className="ix-link" href="/admin/integrations">integrations</Link> first.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3">FB Page</th>
                <th className="py-2 pr-3">IG Business</th>
                <th className="py-2 pr-3">IG Username</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{r.external_id}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {r.fb_page_id ? (
                      <>
                        <div>{r.fb_page_name || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{r.fb_page_id}</div>
                      </>
                    ) : (
                      <span className="text-amber-600">no fb_page_id</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 font-mono">{r.ig_business_id || '—'}</td>
                  <td className="py-2 pr-3">{r.ig_username ? `@${r.ig_username}` : '—'}</td>
                  <td className="py-2 pr-3">
                    {r.fb_page_id && (
                      <form action={resolveIgAccountAction} className="inline">
                        <input type="hidden" name="account_id" value={r.id} />
                        <button className="ix-link text-[11px]">Resolve IG</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </BeithadyShell>
  );
}
