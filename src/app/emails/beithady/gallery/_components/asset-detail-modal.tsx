import Link from 'next/link';
import Image from 'next/image';
import { X, Trash2, Tag, Megaphone, Sparkles, RotateCw, FileText, ExternalLink } from 'lucide-react';
import { fmtBytes } from '@/lib/beithady/gallery/storage';
import { signedUrlFor, publicUrlFor, type GalleryBucket } from '@/lib/beithady/gallery/storage';
import type { GalleryAsset } from '@/lib/beithady/gallery/gallery-list';
import {
  deleteAssetAction,
  retagAssetAction,
  toggleAdEligibleAction,
  relabelAssetAction,
} from '../actions';

// Server-rendered asset detail card. Shows when ?asset=<id> is in the
// query string. Closes by removing ?asset from the URL (close link).

export async function AssetDetailModal({
  asset,
  closeHref,
}: {
  asset: GalleryAsset;
  closeHref: string;
}) {
  let url: string | null = null;
  if (asset.ad_eligible && asset.public_url) {
    url = asset.public_url;
  } else if (asset.storage_bucket === 'beithady-gallery-public') {
    url = publicUrlFor(asset.storage_bucket as GalleryBucket, asset.storage_path);
  } else {
    url = await signedUrlFor(asset.storage_bucket as GalleryBucket, asset.storage_path);
  }

  return (
    <div className="ix-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold truncate">{asset.file_name || '(unnamed)'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {asset.mime_type} · {fmtBytes(asset.size_bytes || 0)}
            {asset.width && asset.height && ` · ${asset.width}×${asset.height}`}
            {asset.duration_sec && ` · ${asset.duration_sec}s`}
          </p>
        </div>
        <Link href={closeHref} className="ix-btn-ghost p-1 text-slate-500"><X size={18} /></Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="aspect-square rounded-lg bg-stone-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center relative">
            {url && asset.mime_type?.startsWith('image/') ? (
              <Image src={url} alt={asset.ai_caption || ''} fill className="object-contain" sizes="(max-width: 768px) 100vw, 600px" unoptimized />
            ) : url && asset.mime_type?.startsWith('video/') ? (
              <video src={url} controls className="w-full h-full" />
            ) : asset.mime_type === 'application/pdf' && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-700 inline-flex items-center gap-2">
                <FileText size={32} /> Open PDF <ExternalLink size={14} />
              </a>
            ) : (
              <span className="text-slate-400">Preview unavailable</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {asset.ad_eligible ? '🌐 CDN public URL (ad-eligible)' : '🔒 Signed URL · 1h TTL'}
          </p>
        </div>

        <div className="space-y-4">
          {asset.ai_caption && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1 flex items-center gap-1">
                <Sparkles size={11} className="text-yellow-600" /> AI caption
              </h3>
              <p className="text-sm">{asset.ai_caption}</p>
              {typeof asset.ai_quality_score === 'number' && asset.ai_quality_score > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">Quality score: {asset.ai_quality_score}/10</p>
              )}
            </div>
          )}

          {asset.ai_tags.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1">AI tags</h3>
              <div className="flex flex-wrap gap-1">
                {asset.ai_tags.map(t => (
                  <span key={t} className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <form action={retagAssetAction} className="space-y-2">
            <input type="hidden" name="asset_id" value={asset.id} />
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium flex items-center gap-1">
              <Tag size={11} /> Manual tags (comma-separated)
            </h3>
            <input
              name="manual_tags"
              defaultValue={asset.manual_tags.join(', ')}
              placeholder="favorite, hero_shot, keep_off_ads"
              className="ix-input w-full text-sm"
            />
            <button type="submit" className="ix-btn-secondary text-xs">Save tags</button>
          </form>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <form action={toggleAdEligibleAction}>
              <input type="hidden" name="asset_id" value={asset.id} />
              <input type="hidden" name="next" value={asset.ad_eligible ? 'off' : 'on'} />
              <button
                type="submit"
                className={`ix-btn-secondary text-xs inline-flex items-center gap-1 ${asset.ad_eligible ? 'border-yellow-400 text-yellow-700 dark:text-yellow-300' : ''}`}
              >
                <Megaphone size={12} />
                {asset.ad_eligible ? 'Demote from ads' : 'Mark ad-eligible'}
              </button>
            </form>

            {asset.category === 'photo' && (
              <form action={relabelAssetAction}>
                <input type="hidden" name="asset_id" value={asset.id} />
                <button type="submit" className="ix-btn-secondary text-xs inline-flex items-center gap-1">
                  <RotateCw size={12} /> Re-label with AI
                </button>
              </form>
            )}

            <form action={deleteAssetAction}>
              <input type="hidden" name="asset_id" value={asset.id} />
              <button
                type="submit"
                className="ix-btn-danger text-xs"
                title="Soft-delete + remove from storage"
              >
                <Trash2 size={12} /> Delete
              </button>
            </form>
          </div>

          <p className="text-[10px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-700">
            Uploaded {new Date(asset.created_at).toLocaleString()}.
            {asset.ai_processed_at && <> AI processed {new Date(asset.ai_processed_at).toLocaleDateString()}.</>}
          </p>
        </div>
      </div>
    </div>
  );
}
