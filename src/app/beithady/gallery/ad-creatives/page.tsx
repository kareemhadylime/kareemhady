import Link from 'next/link';
import { ChevronLeft, Megaphone, Sparkles, UploadCloud } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { Uploader } from '../_components/uploader';
import { AssetGrid } from '../_components/asset-grid';
import { AssetDetailModal } from '../_components/asset-detail-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function AdCreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const sp = await searchParams;
  const list = await listAssets({ filter: { category: 'ad_creative' }, page: 1, pageSize: 100 });
  const asset = sp.asset ? await getAsset(sp.asset) : null;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: 'Ad creatives' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · Ad creatives"
        title="Ad creatives"
        subtitle="Auto-saved by Phase H Ads module on every campaign publish + manually saved variants."
        right={
          <Link href="/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All gallery
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref="/beithady/gallery/ad-creatives" />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <UploadCloud size={14} className="text-yellow-600" />
          Upload ad &amp; post creatives
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Upload images or videos to use in posts, reels, and carousel ads. Supported: JPG, PNG, WEBP, HEIC, MP4, WEBM.
        </p>
        <Uploader category="ad_creative" />
      </section>

      {list.rows.length === 0 ? (
        <div className="ix-card p-8 text-center text-sm text-slate-500 max-w-xl mx-auto space-y-2">
          <Megaphone size={20} className="mx-auto text-slate-300" />
          <p>No ad creatives yet — upload your first one above.</p>
          <p className="text-xs flex items-center gap-1 justify-center">
            <Sparkles size={10} className="text-yellow-600" />
            Phase H Ads module also saves every published carousel + single-image creative here automatically.
          </p>
        </div>
      ) : (
        <AssetGrid assets={list.rows} detailHrefBase="/beithady/gallery/ad-creatives?" />
      )}
    </BeithadyShell>
  );
}
