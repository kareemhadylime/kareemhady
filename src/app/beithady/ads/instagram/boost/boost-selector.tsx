'use client';

// Client-side post selector — no server round-trip on Boost click.
// The server page fetches the media list once; this component handles
// selection state locally so the form appears instantly.

import { useState, useRef } from 'react';
import { Rocket, Heart, MessageSquare, ExternalLink, Play, X, Check } from 'lucide-react';
import { TargetGroupPicker } from '../../_components/target-group-picker';
import { boostInstagramPostAction } from '../../actions';
import { fmtCairoDate } from '@/lib/fmt-date';
import type { IgMediaItem } from '@/lib/beithady/ads/meta-client';

type Account = {
  id: number;
  name: string;
  ig_business_id: string | null;
  ig_username: string | null;
};

export function BoostSelector({
  media,
  account,
}: {
  media: IgMediaItem[];
  account: Account;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);

  const picked = media.find(m => m.id === selectedId) ?? null;

  function selectPost(id: string) {
    setSelectedId(id);
    // Scroll to the form panel after React renders it
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function clearSelection() {
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-4">
      {/* ── Media grid ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {media.map(m => {
          const isVideo = m.media_type === 'VIDEO' || m.media_type === 'REELS';
          const isCarousel = m.media_type === 'CAROUSEL_ALBUM';
          const thumb = m.thumbnail_url || m.media_url;
          const isSelected = selectedId === m.id;

          return (
            <div
              key={m.id}
              className={`border rounded-lg overflow-hidden transition-all ${
                isSelected
                  ? 'border-emerald-500 ring-2 ring-emerald-300 dark:ring-emerald-700'
                  : 'border-slate-200 dark:border-slate-700'
              } bg-white dark:bg-slate-900`}
            >
              <div className="aspect-square bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={m.caption || ''} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    No preview
                  </div>
                )}
                {isVideo && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1">
                    <Play size={12} fill="white" />
                  </div>
                )}
                {isCarousel && (
                  <div className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                    ⊞
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/60 text-white rounded px-1.5 py-0.5 text-[10px] font-semibold">
                  {m.media_product_type || m.media_type}
                </div>
                {isSelected && (
                  <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center pointer-events-none">
                    <div className="bg-emerald-500 text-white rounded-full p-2">
                      <Check size={16} />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-2 text-[11px] space-y-1">
                <div className="line-clamp-2 min-h-[2.4em] text-slate-700 dark:text-slate-200">
                  {m.caption || <span className="italic text-slate-400">no caption</span>}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-0.5">
                      <Heart size={10} /> {m.like_count ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-0.5">
                      <MessageSquare size={10} /> {m.comments_count ?? '—'}
                    </span>
                  </span>
                  <span>{fmtCairoDate(m.timestamp)}</span>
                </div>

                <div className="flex items-center justify-between gap-1 pt-1">
                  {m.permalink && (
                    <a
                      href={m.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="ix-link text-[10px] inline-flex items-center gap-0.5"
                    >
                      View <ExternalLink size={9} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => isSelected ? clearSelection() : selectPost(m.id)}
                    className={`text-[10px] py-1 px-2 inline-flex items-center gap-1 rounded font-medium transition-all ${
                      isSelected
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'ix-btn-primary'
                    }`}
                  >
                    {isSelected ? (
                      <><Check size={10} /> Selected</>
                    ) : (
                      <><Rocket size={10} /> Boost</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Boost form — appears instantly on selection ─────────────── */}
      {picked && (
        <section
          ref={formRef}
          id="boost-form"
          className="ix-card p-5 space-y-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40"
        >
          {/* Selected post preview */}
          <div className="flex items-start gap-4">
            {(picked.thumbnail_url || picked.media_url) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.thumbnail_url || picked.media_url || ''}
                alt=""
                className="w-24 h-24 object-cover rounded-md flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Rocket size={14} className="text-emerald-600" />
                Boost this {picked.media_product_type?.toLowerCase() || picked.media_type.toLowerCase()}
              </h2>
              <p className="text-xs text-slate-500 line-clamp-3 mt-1">
                {picked.caption || 'No caption'}
              </p>
              <div className="text-[10px] text-slate-400 mt-1">
                ♥ {picked.like_count ?? 0} · 💬 {picked.comments_count ?? 0} · posted {fmtCairoDate(picked.timestamp)}
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
              aria-label="Deselect post"
            >
              <X size={16} />
            </button>
          </div>

          <form action={boostInstagramPostAction} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="account_id" value={account.id} />
            <input type="hidden" name="ig_business_id" value={account.ig_business_id || ''} />
            <input type="hidden" name="ig_media_id" value={picked.id} />
            <input type="hidden" name="permalink" value={picked.permalink || ''} />
            <input type="hidden" name="caption" value={picked.caption || ''} />
            <input type="hidden" name="image_url" value={picked.thumbnail_url || picked.media_url || ''} />

            <div className="space-y-1">
              <label htmlFor="campaign_name" className="text-xs font-semibold">
                Campaign name (optional)
              </label>
              <input
                id="campaign_name"
                name="campaign_name"
                className="ix-input"
                placeholder="Auto-generated if blank"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="building_codes" className="text-xs font-semibold">
                Building codes (comma-separated)
              </label>
              <input
                id="building_codes"
                name="building_codes"
                required
                className="ix-input font-mono text-xs"
                placeholder="BH-435, BH-26"
              />
            </div>

            <div className="md:col-span-2">
              <TargetGroupPicker />
            </div>

            <div className="space-y-1">
              <label htmlFor="daily_budget_usd" className="text-xs font-semibold">
                Daily budget (USD)
              </label>
              <input
                id="daily_budget_usd"
                name="daily_budget_usd"
                type="number"
                min="1"
                step="0.5"
                defaultValue="5"
                required
                className="ix-input"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="duration_days" className="text-xs font-semibold">
                Duration (days, 0 = open-ended)
              </label>
              <input
                id="duration_days"
                name="duration_days"
                type="number"
                min="0"
                defaultValue="7"
                className="ix-input"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="monthly_budget_cap_usd" className="text-xs font-semibold">
                Monthly cap (USD, optional)
              </label>
              <input
                id="monthly_budget_cap_usd"
                name="monthly_budget_cap_usd"
                type="number"
                min="1"
                step="10"
                className="ix-input"
                placeholder="200"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="destination" className="text-xs font-semibold">
                Destination
              </label>
              <select id="destination" name="destination" className="ix-input">
                <option value="ctwa">Click-to-WhatsApp (default)</option>
                <option value="link">Website link</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label htmlFor="landing_url" className="text-xs font-semibold">
                Landing URL (only used when destination = link)
              </label>
              <input
                id="landing_url"
                name="landing_url"
                type="url"
                className="ix-input font-mono text-xs"
                placeholder="https://app.limeinc.cc/stay/BH-435"
              />
            </div>

            <div className="md:col-span-2 flex justify-end items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="ix-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="ix-btn-primary">
                <Rocket size={14} /> Boost (PAUSED)
              </button>
            </div>
          </form>

          <p className="text-[11px] text-slate-500">
            Lands PAUSED in Meta Ads Manager. Likes + comments on the original post stay attached to the ad.
          </p>
        </section>
      )}
    </div>
  );
}
