'use client';

import { useMemo, useState } from 'react';
import { Image as ImageIcon, Video as VideoIcon, Check } from 'lucide-react';
import type { GalleryGroup, GalleryPickerAsset } from '@/lib/beithady/ads/ig-post-gallery-picker';

// Gallery picker for the IG Post form. Behaviour depends on postType:
//   image:    single-pick (photo + ad_creative only). Replaces image_url.
//   video:    single-pick (video only). Replaces video_url.
//   carousel: multi-pick (2-10 photos + ad_creatives). Writes a newline-separated
//             list into child_urls in the order they were picked.
//
// Picks are written to hidden mirror inputs (image_url / video_url / child_urls)
// so the existing server action signature stays unchanged. We also clear the
// visible text inputs of the same name to avoid duplicate URL submissions.

type Props = {
  postType: 'image' | 'carousel' | 'video';
  groups: GalleryGroup[];
};

function isVideoAsset(a: GalleryPickerAsset): boolean {
  if (a.category === 'video') return true;
  // crude — file_name extension fallback for assets stored as 'photo' but with mp4
  return /\.(mp4|mov|webm)$/i.test(a.file_name || '');
}

function isPhotoAsset(a: GalleryPickerAsset): boolean {
  if (a.category === 'video') return false;
  if (/\.(mp4|mov|webm)$/i.test(a.file_name || '')) return false;
  return true; // photo, ad_creative, brand_asset
}

export function IgPostGalleryPicker({ postType, groups }: Props) {
  const [activeGroup, setActiveGroup] = useState<string>(groups[0]?.key || '');
  // For single-pick (image/video): just the URL. For carousel: ordered list.
  const [picked, setPicked] = useState<string[]>([]);

  // Filter each group's assets by what's relevant to the post type
  const filteredGroups = useMemo<GalleryGroup[]>(() => {
    const filterFn = postType === 'video' ? isVideoAsset : isPhotoAsset;
    return groups.map(g => ({ ...g, assets: g.assets.filter(filterFn) }))
      .filter(g => g.assets.length > 0);
  }, [groups, postType]);

  if (filteredGroups.length === 0) {
    return (
      <div className="ix-card p-3 text-xs text-slate-500">
        No {postType === 'video' ? 'videos' : 'images'} in the gallery yet for this post type. Paste a URL below or upload to <a href="/beithady/ads/gallery" className="ix-link">the gallery</a> first.
      </div>
    );
  }

  // Make sure activeGroup is still valid after filtering
  const currentGroupKey = filteredGroups.find(g => g.key === activeGroup)?.key || filteredGroups[0].key;
  const currentGroup = filteredGroups.find(g => g.key === currentGroupKey)!;

  function handlePick(url: string) {
    if (postType === 'carousel') {
      setPicked(prev => {
        if (prev.includes(url)) return prev.filter(u => u !== url); // unpick
        if (prev.length >= 10) return prev; // cap at 10
        return [...prev, url];
      });
    } else {
      // single pick — toggle off if same, replace if different
      setPicked(prev => (prev[0] === url ? [] : [url]));
    }
  }

  // Hidden field name aligned to form: image_url / video_url / child_urls
  const fieldName =
    postType === 'image' ? 'image_url'
    : postType === 'video' ? 'video_url'
    : 'child_urls';
  const fieldValue =
    postType === 'carousel' ? picked.join('\n')
    : picked[0] || '';

  return (
    <div className="ix-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Pick from gallery — {postType === 'carousel' ? `${picked.length}/10 selected (tap to add or remove, click order = post order)` : 'tap a thumbnail'}
        </p>
        {picked.length > 0 && (
          <button type="button" onClick={() => setPicked([])} className="text-[11px] text-slate-500 hover:text-rose-600">Clear</button>
        )}
      </div>

      {/* Group tabs (buildings + ad creatives + brand) */}
      <div className="flex flex-wrap gap-1.5">
        {filteredGroups.map(g => (
          <button
            type="button"
            key={g.key}
            onClick={() => setActiveGroup(g.key)}
            className={`px-2 py-1 rounded text-[11px] font-medium border transition ${
              g.key === currentGroupKey
                ? 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-700'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
            }`}
          >
            {g.label} <span className="text-[10px] opacity-60">({g.assets.length})</span>
          </button>
        ))}
      </div>

      {/* Thumbnail grid for the active group */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 max-h-72 overflow-y-auto pr-1">
        {currentGroup.assets.map(a => {
          const idx = picked.indexOf(a.public_url);
          const isPicked = idx >= 0;
          const Icon = isVideoAsset(a) ? VideoIcon : ImageIcon;
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => handlePick(a.public_url)}
              title={a.file_name || a.ai_caption || ''}
              className={`relative aspect-square rounded overflow-hidden border-2 transition ${
                isPicked
                  ? 'border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
                  : 'border-transparent hover:border-slate-400'
              }`}
            >
              {isVideoAsset(a) ? (
                <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                  <VideoIcon size={20} />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.public_url} alt="" loading="lazy" className="w-full h-full object-cover" />
              )}
              <span className="absolute bottom-0.5 left-0.5 bg-black/60 text-white rounded-sm p-0.5">
                <Icon size={9} />
              </span>
              {isPicked && (
                <span className="absolute top-0.5 right-0.5 bg-violet-500 text-white rounded-full p-0.5">
                  {postType === 'carousel'
                    ? <span className="text-[10px] font-bold w-4 h-4 inline-flex items-center justify-center">{idx + 1}</span>
                    : <Check size={11} />}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hidden mirror input — overrides the visible text input on submit. */}
      <input type="hidden" name={fieldName} value={fieldValue} />
      {picked.length > 0 && (
        <p className="text-[10px] text-slate-500 font-mono break-all">
          {postType === 'carousel'
            ? picked.map((u, i) => `${i + 1}. ${u}`).join('\n')
            : picked[0]}
        </p>
      )}
    </div>
  );
}
