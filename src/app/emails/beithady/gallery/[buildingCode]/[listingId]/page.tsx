import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset, getTopTags } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { Uploader } from '../../_components/uploader';
import { AssetGrid } from '../../_components/asset-grid';
import { AssetDetailModal } from '../../_components/asset-detail-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26','BH-73','BH-435','BH-OK','BH-34']);

export default async function GalleryListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string; listingId: string }>;
  searchParams: Promise<{ asset?: string; tag?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode, listingId } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  const sb = supabaseAdmin();
  const { data: listing } = await sb
    .from('guesty_listings')
    .select('id, nickname, title, building_code')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing || (listing as { building_code: string }).building_code !== buildingCode) {
    notFound();
  }

  const filter = {
    building: buildingCode,
    listingId,
    searchTag: sp.tag,
  };

  const [list, asset, topTags] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 60 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags(filter, 12),
  ]);

  const baseHref = `/emails/beithady/gallery/${buildingCode}/${listingId}`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/emails/beithady/gallery' },
      { label: buildingCode, href: `/emails/beithady/gallery/${buildingCode}` },
      { label: (listing as { nickname?: string }).nickname || listingId },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title={(listing as { nickname?: string }).nickname || listingId}
        subtitle={`${list.total.toLocaleString()} assets · ${(listing as { title?: string }).title || ''}`}
        right={
          <Link href={`/emails/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> Back to {buildingCode}
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">Upload to this apartment</h2>
        <Uploader building={buildingCode} listingId={listingId} />
      </section>

      {topTags.length > 0 && (
        <section className="ix-card p-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 font-semibold mr-1">Tags:</span>
          {sp.tag && <Link href={baseHref} className="ix-btn-ghost text-xs px-2 py-0.5">× clear</Link>}
          {topTags.map(t => (
            <Link
              key={t.tag}
              href={`${baseHref}?tag=${encodeURIComponent(t.tag)}`}
              className={`px-2 py-0.5 rounded ${
                sp.tag === t.tag
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200'
              }`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </Link>
          ))}
        </section>
      )}

      <AssetGrid assets={list.rows} detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')} />
    </BeithadyShell>
  );
}
