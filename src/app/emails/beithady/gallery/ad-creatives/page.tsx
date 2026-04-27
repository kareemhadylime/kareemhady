import Link from 'next/link';
import { ChevronLeft, Megaphone, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAssets, getAsset } from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
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
      { label: 'Gallery', href: '/emails/beithady/gallery' },
      { label: 'Ad creatives' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery · Ad creatives"
        title="Ad creatives"
        subtitle="Auto-saved by Phase H Ads module on every campaign publish + manually saved variants."
        right={
          <Link href="/emails/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All gallery
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref="/emails/beithady/gallery/ad-creatives" />}

      {list.rows.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500 max-w-xl mx-auto space-y-2">
          <Megaphone size={20} className="mx-auto text-slate-300" />
          <p>No ad creatives yet.</p>
          <p className="text-xs flex items-center gap-1 justify-center">
            <Sparkles size={10} className="text-yellow-600" />
            Phase H Ads module will save every published carousel + single-image creative here automatically.
          </p>
        </div>
      ) : (
        <AssetGrid assets={list.rows} detailHrefBase="/emails/beithady/gallery/ad-creatives?" />
      )}
    </BeithadyShell>
  );
}
