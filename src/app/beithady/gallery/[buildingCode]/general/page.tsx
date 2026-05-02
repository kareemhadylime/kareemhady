import Link from 'next/link';
import { ChevronLeft, Building2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset, getTopTags, resolveAssetUrls, getListingsForBuilding } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { Uploader } from '../../_components/uploader';
import { SelectableAssetGrid } from '../../_components/selectable-asset-grid';
import { AssetDetailModal } from '../../_components/asset-detail-modal';
import { BulkActionBar } from '../../_components/bulk-action-bar';
import { NukeAlbumButton } from '../../_components/nuke-album-button';
import type { MoveTarget } from '../../_components/move-to-unit-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34']);

// "General Building Area" — building-level photos with no listing_id
// (lobby, pool, gym, exterior, building-wide content).
export default async function GeneralBuildingAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string }>;
  searchParams: Promise<{ asset?: string; tag?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  // Use listAssets for consistent ordering (sort_order ASC). We pass
  // listingId: undefined to fetch all rows in this building, then keep
  // only those with listing_id === null.
  const filter = { building: buildingCode, searchTag: sp.tag };
  const [list, asset, topTags, siblings] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 200 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags(filter, 12),
    getListingsForBuilding(buildingCode),
  ]);
  // True General Building Area = no listing scope AND no template scope.
  // Templated uploads have listing_id NULL but unit_template_id set; they
  // belong to the template's shared library, not the common area.
  const onlyGeneral = list.rows.filter(a => a.listing_id === null && a.unit_template_id === null);
  const items = await resolveAssetUrls(onlyGeneral);
  const idsInOrder = items.map(i => i.asset.id);

  // Move targets: every unit in this building (general is the current album, exclude it)
  const moveTargets: MoveTarget[] = siblings.map(s => ({
    buildingCode, listingId: s.listing_id, label: `🛏️ ${s.nickname}`,
  }));

  const baseHref = `/beithady/gallery/${buildingCode}/general`;
  const albumLabel = `${buildingCode} · General Building Area`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: buildingCode, href: `/beithady/gallery/${buildingCode}` },
      { label: 'General Building Area' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title="General Building Area"
        subtitle={`${onlyGeneral.length.toLocaleString()} asset${onlyGeneral.length === 1 ? '' : 's'} · lobby, pool, gym, exterior, and other building-wide content not tied to a specific unit.`}
        right={
          <div className="flex items-center gap-2">
            <NukeAlbumButton
              buildingCode={buildingCode}
              listingId={null}
              totalAssets={onlyGeneral.length}
              albumLabel={albumLabel}
            />
            <Link href={`/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
              <ChevronLeft size={12} /> Back to {buildingCode}
            </Link>
          </div>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      <section className="ix-card p-4 space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Building2 size={14} className="text-slate-600" />
          Upload to General Building Area
        </h2>
        <p className="text-[11px] text-slate-500">
          Files here are scoped to <strong>{buildingCode}</strong> with no specific unit. Use unit folders for apartment-specific photos.
        </p>
        <Uploader building={buildingCode} />
      </section>

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
        </section>
      )}

      <SelectableAssetGrid
        items={items}
        album={{ building: buildingCode, listingId: null }}
        detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')}
      />

      <BulkActionBar
        album={{ building: buildingCode, listingId: null }}
        idsInOrder={idsInOrder}
        moveTargets={moveTargets}
        allAdEligibleSelected={false}
      />
    </BeithadyShell>
  );
}
