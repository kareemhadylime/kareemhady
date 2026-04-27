import Link from 'next/link';
import { ChevronLeft, ChevronRight, BedDouble } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset, getListingsForBuilding, getTopTags } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { Uploader } from '../_components/uploader';
import { AssetGrid } from '../_components/asset-grid';
import { AssetDetailModal } from '../_components/asset-detail-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26','BH-73','BH-435','BH-OK','BH-34']);

export default async function GalleryBuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string }>;
  searchParams: Promise<{ asset?: string; tag?: string; quality?: string; ad?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  const filter = {
    building: buildingCode,
    searchTag: sp.tag,
    minQuality: sp.quality ? parseInt(sp.quality, 10) : undefined,
    adEligibleOnly: sp.ad === '1',
  };

  const [list, asset, listings, topTags] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 60 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getListingsForBuilding(buildingCode),
    getTopTags(filter, 12),
  ]);

  const baseHref = `/emails/beithady/gallery/${buildingCode}`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/emails/beithady/gallery' },
      { label: buildingCode },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title={buildingCode}
        subtitle={`${list.total.toLocaleString()} assets in this building.`}
        right={
          <Link href="/emails/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All buildings
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref + (sp.tag ? `?tag=${sp.tag}` : '')} />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">Upload to {buildingCode}</h2>
        <Uploader building={buildingCode} />
      </section>

      {listings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">By apartment</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {listings.map(l => (
              <Link
                key={l.listing_id}
                href={`${baseHref}/${l.listing_id}`}
                className="ix-card p-3 block hover:shadow-sm transition flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{l.nickname}</div>
                  <div className="text-[10px] text-slate-500">{l.assets} asset{l.assets === 1 ? '' : 's'}</div>
                </div>
                <BedDouble size={14} className="text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {topTags.length > 0 && (
        <section className="ix-card p-3 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500 font-semibold mr-1">Tags:</span>
          {sp.tag && (
            <Link href={baseHref} className="ix-btn-ghost text-xs px-2 py-0.5">× clear</Link>
          )}
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
          <span className="ml-auto text-slate-500">
            <Link href={`${baseHref}?ad=1`} className="hover:underline">Ad-eligible only</Link>
            {' · '}
            <Link href={`${baseHref}?quality=7`} className="hover:underline">Quality ≥ 7</Link>
          </span>
        </section>
      )}

      <AssetGrid assets={list.rows} detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')} />

      {list.total > list.pageSize && (
        <p className="text-[11px] text-slate-500 text-center">
          Showing first {list.rows.length} of {list.total.toLocaleString()} matching assets. Pagination wires in a follow-up.
        </p>
      )}
    </BeithadyShell>
  );
}
