import Link from 'next/link';
import { Rocket, Heart, MessageSquare, ExternalLink, AlertCircle, Play } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AdsTabs } from '../../_components/ads-tabs';
import { listIgMedia } from '@/lib/beithady/ads/meta-client';
import { boostInstagramPostAction } from '../../actions';
import { fmtCairoDate } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function InstagramBoostPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account_id?: string; media_id?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  const { data: accountsRaw } = await sb
    .from('ads_accounts')
    .select('id, name, fb_page_id, fb_page_name, ig_business_id, ig_username')
    .eq('platform', 'meta')
    .order('id');
  type AccountRow = { id: number; name: string; fb_page_id: string | null; fb_page_name: string | null; ig_business_id: string | null; ig_username: string | null };
  const accounts = ((accountsRaw as AccountRow[] | null) || []).filter(a => !!a.ig_business_id);

  const selectedAccountId = sp.account_id ? Number(sp.account_id) : (accounts[0]?.id || null);
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;

  let mediaList: Awaited<ReturnType<typeof listIgMedia>> | null = null;
  if (selectedAccount?.ig_business_id) {
    mediaList = await listIgMedia(selectedAccount.ig_business_id, 30);
  }

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Boost IG post' }]} containerClass="max-w-6xl">
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
          <Link className="ix-link" href="/beithady/ads/accounts">Resolve IG on a Meta row →</Link>
        </div>
      ) : (
        <>
          <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Account</span>
            {accounts.map(a => (
              <Link
                key={a.id}
                href={`/beithady/ads/instagram/boost?account_id=${a.id}`}
                className={`px-2 py-0.5 rounded ${selectedAccountId === a.id ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {a.ig_username ? `@${a.ig_username}` : a.name}
              </Link>
            ))}
          </section>

          {!mediaList ? (
            <div className="ix-card p-5 text-sm">Select an account.</div>
          ) : !mediaList.ok ? (
            <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">
              Failed to load IG media: {mediaList.error}
            </div>
          ) : mediaList.media.length === 0 ? (
            <div className="ix-card p-5 text-sm text-slate-500">
              No posts found on this account yet.
            </div>
          ) : (
            <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {mediaList.media.map(m => {
                const isVideo = m.media_type === 'VIDEO' || m.media_type === 'REELS';
                const isCarousel = m.media_type === 'CAROUSEL_ALBUM';
                const thumb = m.thumbnail_url || m.media_url;
                const isSelected = sp.media_id === m.id;
                return (
                  <div key={m.id} className={`border rounded-lg overflow-hidden ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-300' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-900`}>
                    <div className="aspect-square bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt={m.caption || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No preview</div>
                      )}
                      {isVideo && (
                        <div className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                          <Play size={12} fill="white" />
                        </div>
                      )}
                      {isCarousel && (
                        <div className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold">⊞</div>
                      )}
                      <div className="absolute top-2 left-2 bg-black/60 text-white rounded px-1.5 py-0.5 text-[10px] font-semibold">
                        {m.media_product_type || m.media_type}
                      </div>
                    </div>
                    <div className="p-2 text-[11px] space-y-1">
                      <div className="line-clamp-2 min-h-[2.4em] text-slate-700 dark:text-slate-200">
                        {m.caption || <span className="italic text-slate-400">no caption</span>}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5"><Heart size={10} /> {m.like_count ?? '—'}</span>
                          <span className="inline-flex items-center gap-0.5"><MessageSquare size={10} /> {m.comments_count ?? '—'}</span>
                        </span>
                        <span>{fmtCairoDate(m.timestamp)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-1">
                        {m.permalink && (
                          <a href={m.permalink} target="_blank" rel="noreferrer" className="ix-link text-[10px] inline-flex items-center gap-0.5">
                            View <ExternalLink size={9} />
                          </a>
                        )}
                        <Link
                          href={`/beithady/ads/instagram/boost?account_id=${selectedAccountId}&media_id=${m.id}`}
                          className="ix-btn-primary text-[10px] py-1 px-2 inline-flex items-center gap-1"
                        >
                          <Rocket size={10} /> Boost
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {sp.media_id && mediaList?.ok && selectedAccount && (() => {
            const picked = mediaList.media.find(m => m.id === sp.media_id);
            if (!picked) return null;
            return (
              <section className="ix-card p-5 space-y-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40">
                <div className="flex items-start gap-4">
                  {(picked.thumbnail_url || picked.media_url) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={picked.thumbnail_url || picked.media_url || ''} alt="" className="w-32 h-32 object-cover rounded-md flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold flex items-center gap-2"><Rocket size={14} /> Boost this {picked.media_product_type?.toLowerCase() || picked.media_type.toLowerCase()}</h2>
                    <p className="text-xs text-slate-500 line-clamp-3 mt-1">{picked.caption || 'No caption'}</p>
                    <div className="text-[10px] text-slate-400 mt-1">
                      ♥ {picked.like_count ?? 0} · 💬 {picked.comments_count ?? 0} · posted {fmtCairoDate(picked.timestamp)}
                    </div>
                  </div>
                </div>

                <form action={boostInstagramPostAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <input type="hidden" name="account_id" value={selectedAccount.id} />
                  <input type="hidden" name="ig_business_id" value={selectedAccount.ig_business_id || ''} />
                  <input type="hidden" name="ig_media_id" value={picked.id} />
                  <input type="hidden" name="permalink" value={picked.permalink || ''} />
                  <input type="hidden" name="caption" value={picked.caption || ''} />

                  <div className="space-y-1">
                    <label htmlFor="campaign_name" className="text-xs font-semibold">Campaign name (optional)</label>
                    <input id="campaign_name" name="campaign_name" className="ix-input" placeholder="Auto-generated if blank" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="building_codes" className="text-xs font-semibold">Building codes (comma-separated)</label>
                    <input id="building_codes" name="building_codes" required className="ix-input font-mono text-xs" placeholder="BH-435, BH-26" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="target_countries" className="text-xs font-semibold">Target countries (ISO, comma-separated)</label>
                    <input id="target_countries" name="target_countries" required defaultValue="EG,SA,AE,DE,IT,RU" className="ix-input font-mono text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label htmlFor="age_min" className="text-xs font-semibold">Age min</label>
                      <input id="age_min" name="age_min" type="number" min="18" max="65" defaultValue="25" className="ix-input" />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="age_max" className="text-xs font-semibold">Age max</label>
                      <input id="age_max" name="age_max" type="number" min="18" max="65" defaultValue="55" className="ix-input" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="daily_budget_usd" className="text-xs font-semibold">Daily budget (USD)</label>
                    <input id="daily_budget_usd" name="daily_budget_usd" type="number" min="1" step="0.5" defaultValue="5" required className="ix-input" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="duration_days" className="text-xs font-semibold">Duration (days, 0=open)</label>
                    <input id="duration_days" name="duration_days" type="number" min="0" defaultValue="7" className="ix-input" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="monthly_budget_cap_usd" className="text-xs font-semibold">Monthly cap (USD, optional)</label>
                    <input id="monthly_budget_cap_usd" name="monthly_budget_cap_usd" type="number" min="1" step="10" className="ix-input" placeholder="200" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="destination" className="text-xs font-semibold">Destination</label>
                    <select id="destination" name="destination" className="ix-input">
                      <option value="ctwa">Click-to-WhatsApp (default)</option>
                      <option value="link">Website link</option>
                    </select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label htmlFor="landing_url" className="text-xs font-semibold">Landing URL (only used when destination = link)</label>
                    <input id="landing_url" name="landing_url" type="url" className="ix-input font-mono text-xs" placeholder="https://app.limeinc.cc/stay/BH-435" />
                  </div>

                  <div className="md:col-span-2 flex justify-end items-center gap-2">
                    <Link href={`/beithady/ads/instagram/boost?account_id=${selectedAccount.id}`} className="ix-btn-secondary text-xs">Cancel</Link>
                    <button type="submit" className="ix-btn-primary">
                      <Rocket size={14} /> Boost (PAUSED)
                    </button>
                  </div>
                </form>
                <p className="text-[11px] text-slate-500">
                  Lands PAUSED in Meta Ads Manager. Likes + comments on the original post stay attached to the ad.
                </p>
              </section>
            );
          })()}
        </>
      )}
    </BeithadyShell>
  );
}
