import Link from 'next/link';
import { Sparkles, Send, Image as ImageIcon, AlertTriangle, ChevronLeft } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { SUPPORTED_LANGUAGES } from '@/lib/beithady/ads/ai-copy';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { generateAdCopyAction, publishCampaignAction } from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34'] as const;

export default async function AdsCreateWizardPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; date?: string; signal?: string; copy?: string; country?: string; language?: string; error?: string }>;
}) {
  await requireBeithadyPermission('ads', 'full');
  const sp = await searchParams;
  const sb = supabaseAdmin();

  // Pull AI-suggested countries (under-indexed signals from Phase G)
  const { data: signals } = await sb
    .from('beithady_market_signals')
    .select('origin_country, signal_type, our_share_pct, egypt_share_pct')
    .eq('signal_type', 'under_indexed')
    .order('delta_pct', { ascending: true })
    .limit(10);
  const suggestedCountries = (signals as Array<{ origin_country: string; signal_type: string }> | null) || [];

  // Pull ad-eligible gallery, optionally filtered by building
  const buildingFilter = sp.building && (BUILDINGS as readonly string[]).includes(sp.building) ? sp.building : null;
  let galleryQ = sb
    .from('beithady_gallery_assets')
    .select('id, public_url, ai_caption, building_code, listing_id')
    .eq('ad_eligible', true)
    .eq('category', 'photo')
    .is('deleted_at', null)
    .limit(40);
  if (buildingFilter) galleryQ = galleryQ.eq('building_code', buildingFilter);
  const { data: gallery } = await galleryQ;
  const galleryRows = (gallery as Array<{ id: string; public_url: string | null; ai_caption: string | null; building_code: string | null }> | null) || [];

  // Pull AI copy variants if `copy=` query has IDs
  let copyVariants: Array<{ id: string; variant: number; headline: string; primary_text: string; cta: string; language: string }> = [];
  if (sp.copy) {
    const ids = sp.copy.split(',').filter(Boolean);
    if (ids.length) {
      const { data } = await sb
        .from('beithady_ads_ai_copy_log')
        .select('id, variant, headline, primary_text, cta, language')
        .in('id', ids)
        .order('variant', { ascending: true });
      copyVariants = (data as typeof copyVariants | null) || [];
    }
  }

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Ads', href: '/beithady/ads' },
      { label: 'Create campaign' },
    ]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads · Create"
        title="New CTWA campaign"
        subtitle="Click-to-WhatsApp via Meta. Pick a building, target countries, gallery photos, and let AI draft the copy."
        right={
          <Link href="/beithady/ads" className="ix-btn-secondary text-xs">
            <ChevronLeft size={12} /> All campaigns
          </Link>
        }
      />

      <AdsTabs active="create" />

      {sp.error && (
        <div className="ix-card border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-xs flex items-center gap-2">
          <AlertTriangle size={14} className="text-rose-600" />
          {sp.error.replace(/[+_]/g, ' ')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Step 1: Generate AI copy */}
        <form action={generateAdCopyAction} className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles size={14} className="text-violet-600" />
            Step 1 — Generate AI copy
          </h2>
          <label className="block">
            <span className="text-xs font-medium">Building</span>
            <select name="building_code" defaultValue={sp.building || ''} className="ix-input w-full mt-1 text-sm">
              <option value="">Any (multi-building campaign)</option>
              {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium">Target country</span>
            <select name="target_country" defaultValue={sp.country || ''} className="ix-input w-full mt-1 text-sm">
              <option value="">— pick from under-indexed signals —</option>
              {suggestedCountries.map(s => (
                <option key={s.origin_country} value={s.origin_country}>
                  {s.origin_country} · under-indexed (Phase G)
                </option>
              ))}
              <option value="EG">EG (Egypt direct market)</option>
              <option value="SA">SA (Saudi Arabia)</option>
              <option value="AE">AE (UAE)</option>
              <option value="GB">GB (United Kingdom)</option>
              <option value="DE">DE (Germany)</option>
              <option value="IT">IT (Italy)</option>
              <option value="RU">RU (Russia)</option>
              <option value="US">US (United States)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium">Language</span>
            <select name="language" defaultValue={sp.language || 'en'} className="ix-input w-full mt-1 text-sm">
              {SUPPORTED_LANGUAGES.map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium">Season / context</span>
            <input name="season" placeholder="winter / eid / summer / new-year" defaultValue={sp.signal === 'gap' ? `gap ${sp.date || ''}`.trim() : ''} className="ix-input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium">Goal</span>
            <input name="goal_text" placeholder="Fill the BH-26 occupancy gap on weekends" className="ix-input w-full mt-1 text-sm" />
          </label>
          <button type="submit" className="ix-btn-primary w-full">
            <Sparkles size={14} /> Generate 3 variants (~$0.003)
          </button>
        </form>

        {/* Step 2: Publish */}
        <form action={publishCampaignAction} className="ix-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Send size={14} className="text-emerald-600" />
            Step 2 — Publish (PAUSED) to Meta
          </h2>

          {copyVariants.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium">Pick a variant</label>
              {copyVariants.map((v, i) => (
                <label key={v.id} className="block ix-card border-slate-200 dark:border-slate-700 p-3 text-xs cursor-pointer hover:border-slate-400">
                  <div className="flex items-start gap-2">
                    <input type="radio" name="copy_variant" value={v.id} required defaultChecked={i === 0} />
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold" style={{ color: 'var(--bh-navy)' }}>{v.headline}</div>
                      <div className="text-slate-600 dark:text-slate-300">{v.primary_text}</div>
                      <div className="text-[10px] text-slate-500">CTA: {v.cta} · Lang: {v.language.toUpperCase()}</div>
                      <input type="hidden" name={`headline_${v.id}`} value={v.headline} />
                      <input type="hidden" name={`primary_text_${v.id}`} value={v.primary_text} />
                      <input type="hidden" name={`cta_${v.id}`} value={v.cta} />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">Generate AI copy in Step 1 first — picked variant slots into headline/primary_text below.</p>
          )}

          <label className="block">
            <span className="text-xs font-medium">Campaign name</span>
            <input
              name="campaign_name"
              required
              placeholder="Beit Hady CTWA — BH-26 winter — DE market"
              defaultValue={sp.building && sp.signal === 'gap' ? `Beit Hady CTWA — ${sp.building} gap ${sp.date || ''}`.trim() : ''}
              className="ix-input w-full mt-1 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium">Buildings (comma-separated)</span>
            <input name="building_codes" required defaultValue={sp.building || ''} className="ix-input w-full mt-1 text-sm" />
          </label>

          <label className="block">
            <span className="text-xs font-medium">Target countries (ISO, comma-separated)</span>
            <input name="target_countries" required defaultValue={sp.country || 'DE,IT,RU,PL,CZ'} className="ix-input w-full mt-1 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium">Daily budget USD</span>
              <input name="daily_budget_usd" type="number" required defaultValue="5" min="1" step="0.5" className="ix-input w-full mt-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Duration (days, 0=open)</span>
              <input name="duration_days" type="number" defaultValue="0" min="0" className="ix-input w-full mt-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Age min</span>
              <input name="age_min" type="number" defaultValue="25" min="18" max="65" className="ix-input w-full mt-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium">Age max</span>
              <input name="age_max" type="number" defaultValue="65" min="18" max="65" className="ix-input w-full mt-1 text-sm" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium">Headline</span>
            <input name="headline" required defaultValue={copyVariants[0]?.headline || ''} className="ix-input w-full mt-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium">Primary text</span>
            <textarea name="primary_text" required rows={3} defaultValue={copyVariants[0]?.primary_text || ''} className="ix-input w-full mt-1 text-sm resize-y" />
          </label>
          <input type="hidden" name="language" value={copyVariants[0]?.language || sp.language || 'en'} />

          {/* Gallery picker */}
          <label className="block">
            <span className="text-xs font-medium flex items-center gap-2">
              <ImageIcon size={12} className="text-violet-600" />
              Carousel photos (pick 1-10 ad-eligible)
            </span>
            {galleryRows.length === 0 ? (
              <p className="text-xs text-slate-500 mt-2">
                No ad-eligible photos for this building yet. Mark photos as ad-eligible in <Link href="/beithady/gallery" className="ix-link">Gallery</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-2 max-h-48 overflow-y-auto">
                {galleryRows.map(g => (
                  <label key={g.id} className="cursor-pointer relative">
                    <input
                      type="checkbox"
                      name="gallery_asset_ids_check"
                      value={g.id}
                      className="peer sr-only"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.public_url || ''}
                      alt={g.ai_caption || ''}
                      className="rounded aspect-square object-cover w-full ring-2 ring-transparent peer-checked:ring-emerald-500 transition"
                    />
                  </label>
                ))}
              </div>
            )}
            {/* Hidden CSV — submitted version. Client JS would normally combine the checkboxes; for SSR we accept the raw input here as a fallback. */}
            <input
              name="gallery_asset_ids"
              defaultValue={galleryRows.slice(0, 3).map(g => g.id).join(',')}
              className="ix-input w-full mt-2 text-xs"
              placeholder="UUIDs comma-separated (auto-fills with first 3 ad-eligible)"
            />
          </label>

          <button type="submit" className="ix-btn-primary w-full">
            <Send size={14} /> Publish (PAUSED in Meta — review before activate)
          </button>
        </form>
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        Campaigns always created PAUSED. Without Meta credentials, saved as DRAFT in DB only.
        Phase G under-indexed signals → suggested target countries. Phase D ad-eligible gallery → carousel creatives.
      </p>
    </BeithadyShell>
  );
}
