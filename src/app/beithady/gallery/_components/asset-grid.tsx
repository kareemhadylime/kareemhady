import Link from 'next/link';
import { FileText, Video, Megaphone, Sparkles, Eye, Image as ImageIcon } from 'lucide-react';
import { signedUrlFor, publicUrlFor, type GalleryBucket } from '@/lib/beithady/gallery/storage';
import type { GalleryAsset } from '@/lib/beithady/gallery/gallery-list';

// Server-rendered asset grid. Mints a signed URL per asset on render
// (1h TTL — fine for browsing). Public assets use their CDN URL.

async function urlFor(a: GalleryAsset): Promise<string | null> {
  if (a.ad_eligible && a.public_url) return a.public_url;
  if (a.storage_bucket === 'beithady-gallery-public') {
    return publicUrlFor(a.storage_bucket as GalleryBucket, a.storage_path);
  }
  return signedUrlFor(a.storage_bucket as GalleryBucket, a.storage_path);
}

export async function AssetGrid({
  assets,
  detailHrefBase,
}: {
  assets: GalleryAsset[];
  detailHrefBase: string; // e.g. /beithady/gallery — the detail page accepts ?asset=<id>
}) {
  if (assets.length === 0) {
    return (
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        <ImageIcon size={24} className="mx-auto text-slate-300 mb-2" />
        No assets yet. Upload some via the panel above.
      </div>
    );
  }
  const urls = await Promise.all(assets.map(urlFor));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {assets.map((a, i) => (
        <AssetCard key={a.id} a={a} url={urls[i]} detailHrefBase={detailHrefBase} />
      ))}
    </div>
  );
}

function AssetCard({ a, url, detailHrefBase }: { a: GalleryAsset; url: string | null; detailHrefBase: string }) {
  const href = `${detailHrefBase}?asset=${a.id}`;
  const tagPreview = (a.manual_tags.length ? a.manual_tags : a.ai_tags).slice(0, 2);
  return (
    <Link
      href={href}
      className="group block ix-card overflow-hidden hover:shadow-md transition"
    >
      <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative overflow-hidden">
        {url && (a.mime_type?.startsWith('image/') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={a.ai_caption || a.file_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition" />
        ) : a.mime_type?.startsWith('video/') ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
            <Video size={32} />
            {a.duration_sec && <span className="absolute bottom-2 right-2 text-xs bg-black/70 px-1.5 py-0.5 rounded">{a.duration_sec}s</span>}
          </div>
        ) : a.mime_type === 'application/pdf' || a.category === 'document' ? (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <FileText size={32} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <ImageIcon size={32} />
          </div>
        ))}
        {/* Top-left: ad-eligible badge */}
        {a.ad_eligible && (
          <span className="absolute top-1 left-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500 text-white shadow">
            <Megaphone size={10} /> Ad
          </span>
        )}
        {/* Top-right: AI quality */}
        {typeof a.ai_quality_score === 'number' && a.ai_quality_score > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-black/70 text-white">
            <Sparkles size={9} /> {a.ai_quality_score}
          </span>
        )}
        {/* Bottom: tag chips overlay on hover */}
        {tagPreview.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] flex items-center gap-1 flex-wrap opacity-0 group-hover:opacity-100 transition">
            {tagPreview.map(t => (
              <span key={t} className="px-1 rounded bg-white/20">{t}</span>
            ))}
            {(a.manual_tags.length + a.ai_tags.length) > tagPreview.length && (
              <span className="opacity-70">+{(a.manual_tags.length + a.ai_tags.length) - tagPreview.length}</span>
            )}
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs truncate text-slate-700 dark:text-slate-200" title={a.ai_caption || a.file_name || ''}>
          {a.ai_caption || a.file_name || '(unnamed)'}
        </div>
        {!a.ai_processed_at && a.category === 'photo' && (
          <div className="text-[9px] text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
            <Sparkles size={8} /> AI labeling…
          </div>
        )}
      </div>
    </Link>
  );
}
