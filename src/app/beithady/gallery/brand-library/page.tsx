import Link from 'next/link';
import { ChevronLeft, Image as ImageIcon } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { Uploader } from '../_components/uploader';
import { AssetGrid } from '../_components/asset-grid';
import { AssetDetailModal } from '../_components/asset-detail-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BrandLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const sp = await searchParams;
  const list = await listAssets({ filter: { category: 'brand_asset' }, page: 1, pageSize: 100 });
  const asset = sp.asset ? await getAsset(sp.asset) : null;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/beithady/gallery' },
      { label: 'Brand library' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · Brand library"
        title="Brand library"
        subtitle="Door signs, room cards, branded merch — assets from BeitHady Branding/. Used as overlays + templates in Phase H Ads."
        right={
          <Link href="/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All gallery
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref="/beithady/gallery/brand-library" />}

      <section className="ix-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <ImageIcon size={14} className="text-yellow-600" />
          Add to brand library
        </h2>
        <Uploader category="brand_asset" />
      </section>

      <AssetGrid assets={list.rows} detailHrefBase="/beithady/gallery/brand-library?" />
    </BeithadyShell>
  );
}
