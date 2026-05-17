'use client';

import { useState } from 'react';
import { Video, Sparkles, Plus } from 'lucide-react';
import type { IdentityVideoItem } from '@/lib/beithady/ads/tiktok-paid-publish';

// Spark Ads picker for /beithady/ads/tiktok/paid.
//
// Two creative modes:
//   - 'new'   — operator uploads a fresh video URL (existing flow).
//   - 'spark' — operator picks an existing organic post from @beithady's feed.
//               Ad creative becomes ad_format='TIKTOK_VIDEO' + tiktok_item_id.
//
// When in 'spark' mode the component:
//   * renders a horizontal thumbnail strip of the identity's recent posts
//   * pre-fills the form's `tiktok_item_id` hidden input
//   * neutralises the video_url field (sets to a placeholder so the form's
//     required validation passes — the server ignores it in spark mode)
//   * optionally seeds the ad_text from the post's display_text via a one-click
//     "Use post caption" button

type Props = {
  posts: IdentityVideoItem[];
  defaultVideoUrl: string;
};

const VIDEO_URL_SPARK_PLACEHOLDER = 'https://spark-ad-existing-post.placeholder/';

export function SparkPicker({ posts, defaultVideoUrl }: Props) {
  const [mode, setMode] = useState<'new' | 'spark'>('new');
  const [pickedItemId, setPickedItemId] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState(defaultVideoUrl);
  const [adText, setAdText] = useState('');

  function chooseMode(next: 'new' | 'spark') {
    setMode(next);
    if (next === 'spark') {
      // Park a placeholder in video_url so the required attr is satisfied
      // even though the server will ignore it.
      setVideoUrl(VIDEO_URL_SPARK_PLACEHOLDER);
    } else {
      setPickedItemId('');
      setVideoUrl(defaultVideoUrl);
    }
  }

  function pickPost(post: IdentityVideoItem) {
    if (pickedItemId === post.item_id) {
      setPickedItemId('');
    } else {
      setPickedItemId(post.item_id);
      // Seed ad_text from caption if operator hasn't typed anything
      if (!adText.trim() && post.display_text) {
        setAdText(post.display_text.slice(0, 100));
      }
    }
  }

  return (
    <div className="md:col-span-2 space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => chooseMode('new')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition ${
            mode === 'new'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
          }`}
        >
          <Plus size={12} /> Use new video URL
        </button>
        <button
          type="button"
          onClick={() => chooseMode('spark')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition ${
            mode === 'spark'
              ? 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-700'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
          }`}
        >
          <Sparkles size={12} /> Promote existing TikTok post (Spark Ad)
        </button>
      </div>

      {/* Spark posts picker */}
      {mode === 'spark' && (
        <div className="ix-card p-3">
          {posts.length === 0 ? (
            <p className="text-xs text-slate-500">
              No posts returned from the TikTok Marketing API. Check the identity is connected (advertiser_id + identity_id on the account row) and that the @beithady account has at least one organic post.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold mb-2 text-slate-500 dark:text-slate-400">
                Pick a post from @beithady — click a thumbnail to use it as the Spark Ad creative
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {posts.map(post => {
                  const selected = pickedItemId === post.item_id;
                  return (
                    <button
                      type="button"
                      key={post.item_id}
                      onClick={() => pickPost(post)}
                      title={post.display_text?.slice(0, 80) || `Post ${post.item_id}`}
                      className={`relative shrink-0 rounded overflow-hidden border-2 transition ${
                        selected
                          ? 'border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
                          : 'border-transparent hover:border-slate-400'
                      }`}
                    >
                      {post.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.cover_image_url} alt="" className="w-20 h-28 object-cover" />
                      ) : (
                        <div className="w-20 h-28 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-white">
                          <Video size={20} />
                        </div>
                      )}
                      {selected && (
                        <span className="absolute top-0.5 right-0.5 bg-violet-500 text-white rounded-full p-0.5">
                          <Sparkles size={10} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {pickedItemId && (
                <p className="text-[10px] text-slate-500 mt-2 font-mono break-all">
                  Selected: {pickedItemId}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Hidden inputs — wired into the parent form via name attrs */}
      <input type="hidden" name="tiktok_item_id" value={mode === 'spark' ? pickedItemId : ''} />

      {/* Video URL field — only shown in 'new' mode (in 'spark' it's a placeholder for required) */}
      {mode === 'new' ? (
        <div className="space-y-1">
          <label htmlFor="video_url" className="text-xs font-semibold">Video URL (public HTTPS)</label>
          <input
            id="video_url"
            name="video_url"
            type="url"
            required
            value={videoUrl}
            onChange={e => setVideoUrl(e.target.value)}
            placeholder="https://..."
            className="ix-input font-mono text-xs"
          />
        </div>
      ) : (
        // Submit a placeholder so the server's "video_url required" branch doesn't trip
        // before the action sees tiktok_item_id. Server ignores it in Spark mode.
        <input type="hidden" name="video_url" value={VIDEO_URL_SPARK_PLACEHOLDER} />
      )}

      {/* Ad text — shared between both modes, owned here so we can seed from the post's caption */}
      <div className="space-y-1">
        <label htmlFor="ad_text" className="text-xs font-semibold">
          Ad text (≤100 chars){mode === 'spark' && ' — pre-filled from the post caption when you pick one'}
        </label>
        <input
          id="ad_text"
          name="ad_text"
          required
          maxLength={100}
          value={adText}
          onChange={e => setAdText(e.target.value)}
          className="ix-input"
        />
      </div>
    </div>
  );
}
