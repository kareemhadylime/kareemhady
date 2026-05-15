'use client';
import { useState } from 'react';
import { Eye, EyeOff, Pencil, Trash2, ExternalLink, Building2, X, Check } from 'lucide-react';
import { TikTokEmbed } from './tiktok-embed';
import type { MarketingReel } from '@/lib/beithady/marketing-reels';

type Actions = {
  update: (formData: FormData) => Promise<void>;
  toggle: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
};

export function ReelCard({ reel, actions }: { reel: MarketingReel; actions: Actions }) {
  const [editing, setEditing] = useState(false);
  const dimmed = !reel.is_visible;

  return (
    <article
      className={`ix-card p-3 space-y-3 ${dimmed ? 'opacity-60' : ''}`}
      data-reel-id={reel.id}
    >
      <div className="flex justify-center">
        <TikTokEmbed url={reel.url} videoId={reel.external_id} caption={reel.caption} />
      </div>

      {editing ? (
        <form
          action={async (fd) => {
            await actions.update(fd);
            setEditing(false);
          }}
          className="space-y-2"
        >
          <input type="hidden" name="id" value={reel.id} />
          <input
            type="text"
            name="caption"
            defaultValue={reel.caption ?? ''}
            placeholder="Caption"
            className="ix-input w-full text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              name="building_code"
              defaultValue={reel.building_code ?? ''}
              placeholder="Building (opt.)"
              className="ix-input text-sm"
            />
            <input
              type="number"
              name="sort_order"
              defaultValue={reel.sort_order}
              className="ix-input text-sm text-center"
              title="Lower = earlier"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ix-btn-secondary text-xs"
            >
              <X size={12} /> Cancel
            </button>
            <button type="submit" className="ix-btn-primary text-xs">
              <Check size={12} /> Save
            </button>
          </div>
        </form>
      ) : (
        <>
          {(reel.caption || reel.building_code) && (
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              {reel.caption && <div className="line-clamp-2">{reel.caption}</div>}
              {reel.building_code && (
                <div className="inline-flex items-center gap-1 text-slate-500">
                  <Building2 size={11} />
                  <span className="font-mono">{reel.building_code}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <a
              href={reel.url}
              target="_blank"
              rel="noreferrer"
              className="ix-link text-xs inline-flex items-center gap-1"
              title="Open on TikTok"
            >
              <ExternalLink size={11} /> Open
            </a>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ix-btn-secondary text-xs"
                title="Edit"
              >
                <Pencil size={11} />
              </button>
              <form action={actions.toggle} className="inline">
                <input type="hidden" name="id" value={reel.id} />
                <button
                  type="submit"
                  className="ix-btn-secondary text-xs"
                  title={reel.is_visible ? 'Hide from gallery' : 'Show in gallery'}
                >
                  {reel.is_visible ? <Eye size={11} /> : <EyeOff size={11} />}
                </button>
              </form>
              <form
                action={actions.remove}
                className="inline"
                onSubmit={(e) => {
                  if (!confirm('Delete this reel? This only removes it from the dashboard — the original TikTok post is not affected.')) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="id" value={reel.id} />
                <button
                  type="submit"
                  className="ix-btn-secondary text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
