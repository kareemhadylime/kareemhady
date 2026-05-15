import Link from 'next/link';
import { Image as ImageIcon, FileText, Megaphone, Building2, ChevronRight, Sparkles, Video as YouTubeIcon } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getBuildingSummaries } from '@/lib/beithady/gallery/gallery-list';
import { getAsset } from '@/lib/beithady/gallery/gallery-list';
import { getGalleryUsage, fmtBytes } from '@/lib/beithady/gallery/storage';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { Uploader } from './_components/uploader';
import { AssetDetailModal } from './_components/asset-detail-modal';
import { processLabelQueueAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILDING_DESCRIPTIONS: Record<string, string> = {
  'BH-26': '26 Cleopatra · serviced apartments',
  'BH-73': '73 Cleopatra · serviced apartments',
  'BH-435': 'A1 Hospitality (Lime 50%)',
  'BH-OK': 'OKAT building',
  'BH-34': '34 Cleopatra',
};

export default async function GalleryLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ asset?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const sp = await searchParams;

  const [summaries, usage, asset] = await Promise.all([
    getBuildingSummaries(),
    getGalleryUsage(),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
  ]);

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Gallery' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery"
        title="Gallery"
        subtitle="Photos, videos, documents, and brand assets — organized by building and apartment. AI auto-labels every photo within minutes."
        right={
          <form action={processLabelQueueAction}>
            <button type="submit" className="ix-btn-secondary text-xs">
              <Sparkles size={12} /> Process AI queue now
            </button>
          </form>
        }
      />

      {asset && (
        <AssetDetailModal asset={asset} closeHref="/beithady/gallery" />
      )}

      {/* Usage stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Total assets" value={usage.asset_count.toLocaleString()} />
        <Stat label="Storage used" value={fmtBytes(usage.total_bytes)} />
        <Stat label="Ad-eligible" value={usage.ad_eligible_count.toLocaleString()} accent="gold" />
        <Stat label="Buildings covered" value={usage.by_building.filter(b => b.building_code).length.toString()} />
      </section>

      {/* Upload anywhere */}
      <section className="ix-card p-4 space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ImageIcon size={14} className="text-violet-600" />
          Quick upload (assigns to "common" — open a building below to upload there)
        </h2>
        <Uploader />
      </section>

      {/* Building tile grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Building2 size={14} className="text-slate-500" />
          By building
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(['BH-26','BH-73','BH-435','BH-OK','BH-34'] as const).map(code => {
            const summary = summaries.find(s => s.building_code === code);
            return (
              <Link
                key={code}
                href={`/beithady/gallery/${code}`}
                className="ix-card p-5 block hover:shadow-md hover:-translate-y-0.5 transition group"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--bh-navy)' }}>{code}</h3>
                    <p className="text-xs text-slate-500">{BUILDING_DESCRIPTIONS[code]}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-700 transition" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mt-3">
                  <Mini label="Photos" value={summary?.photos ?? 0} />
                  <Mini label="Videos" value={summary?.videos ?? 0} />
                  <Mini label="Ad-eligible" value={summary?.ad_eligible_count ?? 0} accent="gold" />
                </div>
                {summary && summary.total_bytes > 0 && (
                  <p className="text-[10px] text-slate-500 mt-2">{fmtBytes(Number(summary.total_bytes))} stored</p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Cross-cutting libraries */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Link href="/beithady/gallery/documents" className="ix-card p-5 block hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mb-2">
            <FileText size={18} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--bh-navy)' }}>Documents</h3>
          <p className="text-xs text-slate-500 mt-1">Floor plans, house rules, owner contracts, licenses.</p>
          <p className="text-[10px] text-slate-400 mt-2">{summaries.reduce((s, b) => s + Number(b.documents || 0), 0)} files</p>
        </Link>

        <Link href="/beithady/gallery/brand-library" className="ix-card p-5 block hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 mb-2">
            <ImageIcon size={18} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--bh-navy)' }}>Brand library</h3>
          <p className="text-xs text-slate-500 mt-1">Door signs, room cards, branded merch from <code>BeitHady Branding/</code>.</p>
          <p className="text-[10px] text-slate-400 mt-2">{summaries.reduce((s, b) => s + Number(b.brand_assets || 0), 0)} files</p>
        </Link>

        <Link href="/beithady/gallery/ad-creatives" className="ix-card p-5 block hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 mb-2">
            <Megaphone size={18} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--bh-navy)' }}>Ad creatives</h3>
          <p className="text-xs text-slate-500 mt-1">Generated by Phase H Ads module + manually saved campaign assets.</p>
          <p className="text-[10px] text-slate-400 mt-2">{summaries.reduce((s, b) => s + Number(b.ad_creatives || 0), 0)} files</p>
        </Link>

        <Link href="/beithady/gallery/youtube" className="ix-card p-5 block hover:shadow-md transition">
          <div className="w-10 h-10 rounded-xl inline-flex items-center justify-center bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 mb-2">
            <YouTubeIcon size={18} />
          </div>
          <h3 className="font-semibold" style={{ color: 'var(--bh-navy)' }}>YouTube</h3>
          <p className="text-xs text-slate-500 mt-1">Upload videos to <code>@beithady</code> with AI-assisted title, description, and tags.</p>
          <p className="text-[10px] text-slate-400 mt-2">V1.1 · upload-out</p>
        </Link>
      </section>

      <p className="text-[11px] text-slate-500 text-center">
        AI labeling: Claude haiku-4-5 vision · ~$0.003/image · ~30s per image · queue runs every 2 min.
      </p>
    </BeithadyShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'gold' }) {
  const cls = accent === 'gold' ? 'text-yellow-700 dark:text-yellow-300' : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: number | string; accent?: 'gold' }) {
  const cls = accent === 'gold' ? 'text-yellow-700 dark:text-yellow-300' : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="text-center">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
