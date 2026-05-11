import Link from 'next/link';
import { Image as ImageIcon, Check, X, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { fmtCairoDate } from '@/lib/fmt-date';
import { toggleGalleryAdEligibleAction, regenerateGalleryCaptionAction } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdsGalleryPage({ searchParams }: { searchParams: Promise<{ building?: string; kind?: string; eligible?: string }> }) {
  const { user, roles } = await requireBeithadyPermission('ads', 'read');
  const canEdit = user.is_admin || roles.some(r => r === 'manager' || r === 'admin');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  let q = sb.from('beithady_gallery_assets')
    .select('id, public_url, ad_eligible, building_code, kind, ai_caption, created_at')
    .order('created_at', { ascending: false })
    .limit(120);
  if (sp.building) q = q.eq('building_code', sp.building);
  if (sp.kind) q = q.eq('kind', sp.kind);
  if (sp.eligible === '1') q = q.eq('ad_eligible', true);
  const { data } = await q;
  type GalleryRow = { id: string; public_url: string | null; ad_eligible: boolean; building_code: string | null; kind: string | null; ai_caption: string | null; created_at: string };
  const rows = (data as GalleryRow[] | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Gallery' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Creative gallery"
        subtitle="Images + videos available to ad creatives. Filter by building, kind, or ad_eligible. Manage uploads under /beithady/gallery."
        right={<Link href="/beithady/gallery" className="ix-btn-secondary"><ImageIcon size={14} /> Upload</Link>}
      />

      <AdsTabs active="gallery" />

      <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <FilterChip label="All" href="/beithady/ads/gallery" active={!sp.kind && !sp.eligible} />
        <FilterChip label="Photos" href="/beithady/ads/gallery?kind=photo" active={sp.kind === 'photo'} />
        <FilterChip label="Videos" href="/beithady/ads/gallery?kind=video" active={sp.kind === 'video'} />
        <span className="mx-2 text-slate-300">|</span>
        <FilterChip label="Ad eligible" href="/beithady/ads/gallery?eligible=1" active={sp.eligible === '1'} />
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {rows.length === 0 && <p className="col-span-full text-center text-sm text-slate-500 py-8">No gallery assets match these filters.</p>}
        {rows.map(r => (
          <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900">
            <div className="aspect-square bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
              {r.public_url ? (
                r.kind === 'video' ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={r.public_url} className="w-full h-full object-cover" controls={false} muted preload="metadata" />
                ) : (
                  <img src={r.public_url} alt={r.ai_caption || ''} className="w-full h-full object-cover" />
                )
              ) : (
                <ImageIcon size={24} className="text-slate-400" />
              )}
            </div>
            <div className="p-2 text-[10px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono">{r.building_code || '—'}</span>
                {canEdit ? (
                  <form action={toggleGalleryAdEligibleAction} className="inline">
                    <input type="hidden" name="asset_id" value={r.id} />
                    <input type="hidden" name="desired" value={r.ad_eligible ? '0' : '1'} />
                    <button
                      type="submit"
                      title={r.ad_eligible ? 'Mark NOT ad-eligible' : 'Mark ad-eligible'}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold ${
                        r.ad_eligible
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {r.ad_eligible ? <Check size={9} /> : <X size={9} />}
                      eligible
                    </button>
                  </form>
                ) : (
                  r.ad_eligible && <span className="text-emerald-600">eligible</span>
                )}
              </div>
              <div className="text-slate-500 truncate" title={r.ai_caption || ''}>{r.ai_caption || <span className="italic">no caption</span>}</div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{fmtCairoDate(r.created_at)}</span>
                {canEdit && (
                  <form action={regenerateGalleryCaptionAction} className="inline">
                    <input type="hidden" name="asset_id" value={r.id} />
                    <input type="hidden" name="language" value="en" />
                    <input type="hidden" name="surface" value="ig_caption" />
                    <button type="submit" title="Generate AI caption" className="inline-flex items-center gap-0.5 text-violet-600 hover:underline">
                      <Sparkles size={9} /> AI
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>
    </BeithadyShell>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`px-2 py-0.5 rounded ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
      {label}
    </Link>
  );
}
