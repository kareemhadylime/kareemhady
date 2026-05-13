import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { listIgMedia } from '@/lib/beithady/ads/meta-client';
import { BoostSelector } from './boost-selector';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function InstagramBoostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account_id?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  const { data: accountsRaw } = await sb
    .from('ads_accounts')
    .select('id, name, fb_page_id, fb_page_name, ig_business_id, ig_username')
    .eq('platform', 'meta')
    .order('id');

  type AccountRow = {
    id: number;
    name: string;
    fb_page_id: string | null;
    fb_page_name: string | null;
    ig_business_id: string | null;
    ig_username: string | null;
  };

  const accounts = ((accountsRaw as AccountRow[] | null) || []).filter(
    a => !!a.ig_business_id
  );

  const selectedAccountId = sp.account_id
    ? Number(sp.account_id)
    : accounts[0]?.id ?? null;
  const selectedAccount =
    accounts.find(a => a.id === selectedAccountId) ?? accounts[0] ?? null;

  let mediaList: Awaited<ReturnType<typeof listIgMedia>> | null = null;
  if (selectedAccount?.ig_business_id) {
    mediaList = await listIgMedia(selectedAccount.ig_business_id, 30);
  }

  return (
    <BeithadyShell
      breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Boost IG post' }]}
      containerClass="max-w-6xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Boost existing Instagram content"
        subtitle="Promote a Reel, post, or carousel you've already published. The ad keeps the organic likes + comments, which boosts social proof."
      />

      <AdsTabs active="ig-boost" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm flex items-center gap-2 font-mono">
          <AlertCircle size={14} className="text-rose-600" /> {sp.error}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="ix-card p-5 text-sm space-y-2">
          <p>No IG Business account resolved yet.</p>
          <Link className="ix-link" href="/beithady/ads/accounts">
            Resolve IG on a Meta row →
          </Link>
        </div>
      ) : (
        <>
          {/* Account switcher */}
          <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Account</span>
            {accounts.map(a => (
              <Link
                key={a.id}
                href={`/beithady/ads/instagram/boost?account_id=${a.id}`}
                className={`px-2 py-0.5 rounded ${
                  selectedAccountId === a.id
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {a.ig_username ? `@${a.ig_username}` : a.name}
              </Link>
            ))}
          </section>

          {!mediaList ? (
            <div className="ix-card p-5 text-sm">Select an account.</div>
          ) : !mediaList.ok ? (
            <div className="ix-card border-rose-200 bg-rose-50 dark:bg-rose-950 p-3 text-sm font-mono">
              Failed to load IG media: {mediaList.error}
            </div>
          ) : mediaList.media.length === 0 ? (
            <div className="ix-card p-5 text-sm text-slate-500">
              No posts found on this account yet.
            </div>
          ) : (
            /* Client component — handles selection + form entirely in-browser */
            <BoostSelector media={mediaList.media} account={selectedAccount!} />
          )}
        </>
      )}
    </BeithadyShell>
  );
}
