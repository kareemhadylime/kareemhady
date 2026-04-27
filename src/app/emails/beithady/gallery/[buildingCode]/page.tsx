import Link from 'next/link';
import { ChevronLeft, Building2, FolderOpen, Image as ImageIcon, Video, Megaphone } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getAsset,
  getUnitFoldersForBuilding,
  getCommonAreaSummary,
  listAssets,
} from '@/lib/beithady/gallery/gallery-list';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { Uploader } from '../_components/uploader';
import { UnitFolderCard } from '../_components/unit-folder-card';
import { AssetDetailModal } from '../_components/asset-detail-modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID = new Set(['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34']);

const BUILDING_TITLES: Record<string, string> = {
  'BH-26': 'BH-26 · 26 Cleopatra',
  'BH-73': 'BH-73 · 73 Cleopatra',
  'BH-435': 'BH-435 · A1 Hospitality (Lime 50%)',
  'BH-OK': 'BH-OK · OKAT building',
  'BH-34': 'BH-34 · 34 Cleopatra',
};

export default async function GalleryBuildingPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingCode: string }>;
  searchParams: Promise<{ asset?: string }>;
}) {
  await requireBeithadyPermission('gallery', 'read');
  const { buildingCode } = await params;
  if (!VALID.has(buildingCode)) notFound();
  const sp = await searchParams;

  const [unitFolders, common, asset] = await Promise.all([
    getUnitFoldersForBuilding(buildingCode),
    getCommonAreaSummary(buildingCode),
    sp.asset ? getAsset(sp.asset) : Promise.resolve(null),
  ]);

  // Pull the latest few assets for the modal close-link target
  const baseHref = `/emails/beithady/gallery/${buildingCode}`;

  // Stats roll-up across all units + common
  const totalUnits = unitFolders.length;
  const populatedUnits = unitFolders.filter(u => u.total > 0).length;
  const totalPhotos = unitFolders.reduce((s, u) => s + u.photos, 0) + common.photos;
  const totalVideos = unitFolders.reduce((s, u) => s + u.videos, 0) + common.videos;
  const totalAdEligible = unitFolders.reduce((s, u) => s + u.ad_eligible, 0);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Gallery', href: '/emails/beithady/gallery' },
      { label: buildingCode },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Gallery · ${buildingCode}`}
        title={BUILDING_TITLES[buildingCode] || buildingCode}
        subtitle={`${totalUnits} unit${totalUnits === 1 ? '' : 's'} imported from Guesty · ${populatedUnits} with photos · ${totalPhotos} photos · ${totalVideos} videos.`}
        right={
          <Link href="/emails/beithady/gallery" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All buildings
          </Link>
        }
      />

      {asset && <AssetDetailModal asset={asset} closeHref={baseHref} />}

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <Stat label="Units (Guesty)" value={totalUnits} icon={Building2} />
        <Stat label="With photos" value={populatedUnits} accent="emerald" />
        <Stat label="Photos" value={totalPhotos} icon={ImageIcon} />
        <Stat label="Videos" value={totalVideos} icon={Video} />
        <Stat label="Ad-eligible" value={totalAdEligible} icon={Megaphone} accent="gold" />
      </section>

      {/* Upload — with unit picker */}
      <section className="ix-card p-4 space-y-2">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <FolderOpen size={14} className="text-violet-600" />
          Upload to {buildingCode}
        </h2>
        <p className="text-[11px] text-slate-500">
          Pick the target folder below — the upload lands inside that unit (or in the General Building Area).
        </p>
        <Uploader
          building={buildingCode}
          units={unitFolders.map(u => ({
            listing_id: u.listing_id,
            nickname: u.nickname,
            total: u.total,
          }))}
        />
      </section>

      {/* General Building Area folder */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Building2 size={14} className="text-slate-500" />
          General Building Area
        </h2>
        <Link
          href={`/emails/beithady/gallery/${buildingCode}/general`}
          className="ix-card overflow-hidden block hover:shadow-md hover:-translate-y-0.5 transition group max-w-md"
        >
          <div className="flex">
            <div className="relative w-32 sm:w-40 aspect-square bg-stone-100 dark:bg-slate-800 shrink-0">
              {common.cover_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={common.cover_url}
                  alt="General Building Area"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Building2 size={32} strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="p-3 flex-1 min-w-0 space-y-1.5">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--bh-navy)' }}>
                General Building Area
              </h3>
              <p className="text-[11px] text-slate-500">
                Lobby · pool · gym · exterior · building-wide shots not tied to a specific unit.
              </p>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                {common.photos > 0 && <span className="inline-flex items-center gap-1"><ImageIcon size={10} /> {common.photos}</span>}
                {common.videos > 0 && <span className="inline-flex items-center gap-1"><Video size={10} /> {common.videos}</span>}
                {common.count === 0 && <span className="text-slate-400 italic">no photos yet</span>}
              </div>
            </div>
          </div>
        </Link>
      </section>

      {/* Unit folder grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <FolderOpen size={14} className="text-slate-500" />
          Units · {totalUnits} imported from Guesty
        </h2>
        {unitFolders.length === 0 ? (
          <div className="ix-card p-10 text-center text-sm text-slate-500">
            <Building2 size={20} className="mx-auto mb-2 text-slate-300" />
            No active Guesty listings under <code>{buildingCode}</code> yet. Run the Guesty sync at <code>/api/cron/guesty</code>.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {unitFolders.map(folder => (
              <UnitFolderCard key={folder.listing_id} folder={folder} baseHref={baseHref} />
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-500 text-center">
        Folders auto-import from <code>guesty_listings</code> (active, non-MTL parents) where <code>building_code = {buildingCode}</code>.
        Photos land in their unit folder when a unit is picked above; otherwise in General Building Area.
      </p>
    </BeithadyShell>
  );
}

function Stat({
  label, value, accent, icon: Icon,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'gold';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  const cls = accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'gold' ? 'text-yellow-700 dark:text-yellow-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center justify-center gap-1">
        {Icon && <Icon size={10} />}
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value.toLocaleString()}</div>
    </div>
  );
}
