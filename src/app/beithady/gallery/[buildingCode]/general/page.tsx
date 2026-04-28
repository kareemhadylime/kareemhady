import Link from 'next/link';
import { ChevronLeft, Building2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getAsset, getTopTags } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { Uploader } from '../../_components/uploader';
import { AssetGrid } from '../../_components/asset-grid';
import { AssetDetailModal } from '../../_components/asset-detail-modal';

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

  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_gallery_assets')
    .select(
      'id, building_code, listing_id, category, storage_bucket, storage_path, public_url, file_name, mime_type, width, height, duration_sec, size_bytes, ai_tags, ai_caption, ai_quality_score, ai_processed_at, manual_tags, ad_eligible, uploaded_by, notes, created_at',
      { count: 'exact' }
    )
    .eq('building_code', buildingCode)
    .is('listing_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(60);
  if (sp.tag) {
    const t = sp.tag.toLowerCase();
    q = q.or(`ai_tags.cs.{${t}},manual_tags.cs.{${t}}`);
  }
  const [{ data: rows, count }, asset, topTags] = await Promise.all([
    q,
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
    getTopTags({ building: buildingCode, searchTag: sp.tag }, 12),
  ]);

  const baseHref = `/beithady/gallery/${buildingCode}/general`;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: buildingCode, href: `/beithady/gallery/${buildingCode}` },
      { label: 'General Building Area' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title="General Building Area"
        subtitle={`${(count ?? 0).toLocaleString()} asset${(count ?? 0) === 1 ? '' : 's'} · lobby, pool, gym, exterior, and other building-wide content not tied to a specific unit.`}
        right={
          <Link href={`/beithady/gallery/${buildingCode}`} className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> Back to {buildingCode}
          </Link>
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

      {(rows && rows.length > 0) ? (
        <AssetGrid
          assets={rows as unknown as Parameters<typeof AssetGrid>[0]['assets']}
          detailHrefBase={baseHref + (sp.tag ? `?tag=${sp.tag}&` : '?')}
        />
      ) : (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <Building2 size={20} className="mx-auto mb-2 text-slate-300" />
          No general-area photos for {buildingCode} yet. Drag files in above to start.
        </div>
      )}
    </BeithadyShell>
  );
}
