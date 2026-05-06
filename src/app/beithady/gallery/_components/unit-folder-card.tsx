import Link from 'next/link';
import { BedDouble, Image as ImageIcon, Video, FileText, Megaphone, Layers } from 'lucide-react';
import type { UnitFolder } from '@/lib/beithady/gallery/gallery-list';

// Visual unit folder card — used on the building page. Cover thumbnail
// (most-recent photo) + nickname + counts breakdown. When the folder
// represents a unit template, shows a "shared across N units" badge.

export function UnitFolderCard({ folder, baseHref }: { folder: UnitFolder; baseHref: string }) {
  const empty = folder.total === 0;
  const isTemplate = !!folder.unit_template_id && folder.member_listing_ids.length > 1;
  const memberCount = folder.member_listing_ids.length;
  return (
    <Link
      href={`${baseHref}/${folder.listing_id}`}
      className="group ix-card overflow-hidden block hover:shadow-md hover:-translate-y-0.5 transition"
    >
      <div className="relative aspect-video bg-stone-100 dark:bg-slate-800 overflow-hidden">
        {folder.cover_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={folder.cover_url}
            alt={folder.cover_caption || folder.nickname}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <BedDouble size={32} strokeWidth={1.5} />
          </div>
        )}
        {empty && (
          <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
            Empty
          </span>
        )}
        {isTemplate && (
          <span className="absolute bottom-2 left-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 inline-flex items-center gap-1">
            <Layers size={9} /> shared · {memberCount} units
          </span>
        )}
        {folder.ad_eligible > 0 && (
          <span className="absolute top-2 left-2 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 inline-flex items-center gap-1">
            <Megaphone size={9} /> {folder.ad_eligible} ad-ready
          </span>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--bh-navy)' }}>{folder.nickname}</h3>
          <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{folder.total} item{folder.total === 1 ? '' : 's'}</span>
        </div>
        {folder.title && folder.title !== folder.nickname && (
          <p className="text-[11px] text-slate-500 truncate">{folder.title}</p>
        )}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          {folder.photos > 0 && (
            <span className="inline-flex items-center gap-1"><ImageIcon size={10} /> {folder.photos}</span>
          )}
          {folder.videos > 0 && (
            <span className="inline-flex items-center gap-1"><Video size={10} /> {folder.videos}</span>
          )}
          {folder.documents > 0 && (
            <span className="inline-flex items-center gap-1"><FileText size={10} /> {folder.documents}</span>
          )}
          {empty && (
            <span className="text-slate-400 italic">no photos yet</span>
          )}
        </div>
      </div>
    </Link>
  );
}
