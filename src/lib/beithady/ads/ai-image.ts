import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// AI image variants. Generates creative variants of existing gallery
// photos using Replicate's image-edit API (gentle re-stylings, seasonal
// overlays, mood variations). Output is saved as a new
// beithady_gallery_assets row with ad_eligible=true.
//
// Why Replicate vs OpenAI / Anthropic: as of now, image-out APIs from
// Anthropic don't ship; OpenAI Images works but requires its own org.
// Replicate proxies any of FLUX, SDXL, etc., one API. The env var
// REPLICATE_API_TOKEN gates the call — if missing, the action 'skipped's
// gracefully.

const REPLICATE_BASE = 'https://api.replicate.com/v1';
// FLUX schnell — cheap (~$0.003/image), 1024x1024, ~2s per gen.
const DEFAULT_MODEL = 'black-forest-labs/flux-schnell';

type GenerateInput = {
  sourceAssetId?: string;        // an existing gallery asset to inspire the prompt
  prompt: string;
  buildingCode: string | null;
  numVariants?: number;          // default 2
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:5';
};

type GeneratedImage = {
  url: string;
  prediction_id: string;
  prompt: string;
};

export type GenerateImagesResult =
  | { ok: true; mode: 'live' | 'skipped'; images: GeneratedImage[]; saved_asset_ids: string[]; error?: string }
  | { ok: false; mode: 'live' | 'skipped'; error: string };

async function runReplicate(prompt: string, aspectRatio: string): Promise<{ ok: boolean; url?: string; prediction_id?: string; error?: string }> {
  const token = process.env.REPLICATE_API_TOKEN || '';
  if (!token) return { ok: false, error: 'REPLICATE_API_TOKEN missing' };

  try {
    // Replicate's "Predictions" API. With ?wait=preferred, the response
    // includes the finished output URL inline for fast models like FLUX
    // schnell (avoids the poll loop).
    const r = await fetch(`${REPLICATE_BASE}/models/${DEFAULT_MODEL}/predictions?wait=preferred`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=30',
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: aspectRatio,
          output_format: 'jpg',
          output_quality: 88,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; output?: string | string[]; status?: string; error?: unknown };
    if (!r.ok || j.error) {
      return { ok: false, error: `replicate_${r.status}: ${JSON.stringify(j.error || {})}` };
    }
    // output may be a single URL string or an array (FLUX returns array of 1)
    const url = Array.isArray(j.output) ? j.output[0] : j.output;
    if (!url) return { ok: false, error: 'no_output_url' };
    return { ok: true, url, prediction_id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function generateAdImageVariants(input: GenerateInput): Promise<GenerateImagesResult> {
  const token = process.env.REPLICATE_API_TOKEN || '';
  if (!token) return { ok: true, mode: 'skipped', images: [], saved_asset_ids: [], error: 'REPLICATE_API_TOKEN not configured' };

  const variants = Math.max(1, Math.min(4, input.numVariants ?? 2));
  const aspectRatio = input.aspectRatio || '1:1';

  const sb = supabaseAdmin();
  // Optionally enrich the prompt with the source asset's caption
  let enriched = input.prompt;
  if (input.sourceAssetId) {
    const { data: src } = await sb
      .from('beithady_gallery_assets')
      .select('ai_caption, ai_tags')
      .eq('id', input.sourceAssetId)
      .maybeSingle();
    const srcRow = src as { ai_caption: string | null; ai_tags: string[] | null } | null;
    const cues = [srcRow?.ai_caption, ...(srcRow?.ai_tags || []).slice(0, 5)].filter(Boolean).join(', ');
    if (cues) enriched = `${input.prompt}. Visual cues from source: ${cues}`;
  }
  enriched = `${enriched}. Premium hospitality photography style, natural light, no text overlay.`;

  const images: GeneratedImage[] = [];
  for (let i = 0; i < variants; i++) {
    const r = await runReplicate(enriched, aspectRatio);
    if (r.ok && r.url) {
      images.push({ url: r.url, prediction_id: r.prediction_id || '', prompt: enriched });
    }
  }

  if (images.length === 0) {
    return { ok: false, mode: 'live', error: 'no_images_generated' };
  }

  // Persist into beithady_gallery_assets so the operator can immediately
  // pick them for an ad. We store the Replicate output URL directly — it's
  // CDN-backed and lives ~24h. A future cron should re-host these to
  // Supabase Storage for permanence; flagged in notes for now.
  const savedIds: string[] = [];
  for (const img of images) {
    const { data: ins } = await sb.from('beithady_gallery_assets').insert({
      building_code: input.buildingCode,
      category: 'photo',
      public_url: img.url,
      ai_caption: img.prompt.slice(0, 280),
      ai_model: DEFAULT_MODEL,
      ai_processed_at: new Date().toISOString(),
      ad_eligible: false,                  // operator must approve before use
      notes: `AI-generated via Replicate ${DEFAULT_MODEL} (prediction ${img.prediction_id}). Re-host to Supabase Storage before relying on long-term.`,
    }).select('id').single();
    if (ins) savedIds.push(((ins as { id: string }).id));
  }

  return { ok: true, mode: 'live', images, saved_asset_ids: savedIds };
}
