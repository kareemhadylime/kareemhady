import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
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
    .select('id, nickname, title, building_code, unit_template_id')
    .eq('id', listingId)
    .maybeSingle();
  if (!listing || (listing as { building_code: string }).building_code !== buildingCode) {
    notFound();
  }
  const listingData = listing as { id: string; nickname?: string; title?: string; unit_template_id: string | null };
  const unitTemplateId = listingData.unit_template_id;

  // Optionally fetch the template name for the page subtitle.
  let templateName: string | null = null;
  let templateMembers: string[] = [];
  if (unitTemplateId) {
    const [{ data: tpl }, { data: members }] = await Promise.all([
      sb.from('beithady_unit_templates').select('name').eq('id', unitTemplateId).maybeSingle(),
      sb.from('guesty_listings').select('nickname').eq('unit_template_id', unitTemplateId).order('nickname'),
    ]);
    templateName = (tpl as { name: string } | null)?.name || null;
    templateMembers = ((members as Array<{ nickname: string | null }> | null) || []).map(m => m.nickname || '').filter(Boolean);
  }

  const filter = { building: buildingCode, listingId, unitTemplateId: unitTemplateId || undefined, searchTag: sp.tag };

  const [list, asset, topTags, siblings] = await Promise.all([
    listAssets({ filter, page: 1, pageSize: 200 }),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags(filter, 12),
    getListingsForBuilding(buildingCode),
  ]);
  const items = await resolveAssetUrls(list.rows);
  const idsInOrder = items.map(i => i.asset.id);

  // Move targets: every other unit in this building + general.
  // Templated listings are collapsed (one entry per template) so the
  // move dropdown isn't cluttered with 4 identical targets per group.
  const seenTpls = new Set<string>();
  const moveTargets: MoveTarget[] = [
    { buildingCode, listingId: null, label: `📍 ${buildingCode} · General Building Area` },
    ...siblings
      .filter(s => {
        if (s.listing_id === listingId) return false;
        if (s.unit_template_id && unitTemplateId && s.unit_template_id === unitTemplateId) return false; // same template = same album
        if (s.unit_template_id) {
          if (seenTpls.has(s.unit_template_id)) return false;
          seenTpls.add(s.unit_template_id);
          return true;
        }
        return true;
      })
      .map(s => ({ buildingCode, listingId: s.listing_id, label: `🛏️ ${s.nickname}` })),
  ];

  const baseHref = `/beithady/gallery/${buildingCode}/${listingId}`;
  const albumLabel = templateName || listingData.nickname || listingId;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: buildingCode, href: `/beithady/gallery/${buildingCode}` },
      { label: albumLabel },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title={albumLabel}
        subtitle={
          unitTemplateId
            ? `${list.total.toLocaleString()} shared assets · shown in ${templateMembers.join(' / ') || 'all matching units'}`
            : `${list.total.toLocaleString()} assets · ${listingData.title || ''}`
        }
        right={
          <div className="flex items-center gap-2">
            <NukeAlbumButton
              buildingCode={buildingCode}
              listingId={listingId}
              unitTemplateId={unitTemplateId || null}
              totalAssets={list.total}
              albumLabel={albumLabel}
            />
            <Link href={`/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
              <ChevronLeft size={12} /> Back to {buildingCode}
            </Link>
          </div>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
          {unitTemplateId
            ? `Upload to ${templateName || 'this template'} (shared across ${templateMembers.length} unit${templateMembers.length === 1 ? '' : 's'})`
            : 'Upload to this apartment'}
        </h2>
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

      <SelectableAssetGrid
        items={items}
        album={{ building: buildingCode, listingId, unitTemplateId: unitTemplateId || null }}
        detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')}
      />

      <BulkActionBar
        album={{ building: buildingCode, listingId, unitTemplateId: unitTemplateId || null }}
        idsInOrder={idsInOrder}
        moveTargets={moveTargets}
        allAdEligibleSelected={false}
      />
    </BeithadyShell>
  );
}
