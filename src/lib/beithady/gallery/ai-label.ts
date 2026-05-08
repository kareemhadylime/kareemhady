import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { signedUrlFor, type GalleryBucket } from './storage';

// AI auto-labeling for uploaded photos. Calls Claude haiku-4-5 with
// the image data, expects strict JSON output (room type, features,
// quality score 0-10, caption). Skips video for now (cost + Claude
// vision doesn't support video frames yet).

const MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export type LabelResult = {
  tags: string[];
  caption: string;
  quality_score: number;
};

const PROMPT = `You are tagging an interior/property photo for Beit Hady, a serviced-apartment business in Egypt + Dubai. Return a strict JSON object with these keys (and nothing else, no preamble, no code fence):

{
  "tags": ["lowercase_snake", ...],   // 4-10 tags from this controlled vocabulary:
                                     //   room types: bedroom, master_bedroom, kids_bedroom, living_room, dining_room, kitchen, bathroom, balcony, terrace, hallway, office, gym, lobby, pool, spa, parking, exterior, rooftop, view
                                     //   features: sea_view, city_view, garden_view, jacuzzi, king_bed, queen_bed, twin_beds, smart_tv, fireplace, marble_floor, parquet, walk_in_shower, bathtub, double_sink, gas_stove, induction_stove, dishwasher, microwave, washing_machine, smart_lock, ac, heating, fans, balcony_furniture, dining_table, sofa_bed, work_desk, baby_cot
                                     //   moods: bright, cozy, modern, minimalist, classic, luxury, family, romantic, business
  "caption": "One sentence (≤16 words), present tense, no marketing fluff",
  "quality_score": 0-10               // honest ad-suitability: 0=blurry/cluttered, 10=magazine-quality
}

If the image is a document scan, blueprint, screenshot, branded merch, or otherwise not a property photo, return tags=["non_property"], caption describing what it is, quality_score=0.`;

async function fetchAsBase64(bucket: GalleryBucket, path: string): Promise<{ data: string; mime: string } | null> {
  // Use Supabase Storage's /render/image/ endpoint to fetch a downscaled
  // re-encoded variant (1024 px max edge, q=85 JPEG). Anthropic vision
  // works great at this resolution and the variant always fits under
  // the 5 MB base64 cap regardless of original file size.
  const url = await signedUrlFor(bucket, path, 3600, {
    width: 1024,
    height: 1024,
    resize: 'contain',
    quality: 85,
  });
  if (!url) return null;
  // 15s timeout — Supabase Storage signed-URL stalls would otherwise
  // hang the AI-label cron worker until Vercel kills the function and
  // loses the whole batch of jobs.
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const mime = res.headers.get('content-type') || 'image/jpeg';
  const buf = await res.arrayBuffer();
  // Defensive guard — transform should always keep us under 5 MB, but
  // if a future change ever produces a larger blob, fail closed rather
  // than blow up Anthropic's API call.
  if (buf.byteLength > 5 * 1024 * 1024) return null;
  const b64 = Buffer.from(buf).toString('base64');
  return { data: b64, mime };
}

export async function labelImage(bucket: GalleryBucket, path: string): Promise<LabelResult> {
  const client = getClient();
  const fetched = await fetchAsBase64(bucket, path);
  if (!fetched) {
    throw new Error('image_too_large_or_unfetchable');
  }
  // Anthropic SDK accepts image source as { type: 'base64', media_type, data }
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    temperature: 0.2,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: (fetched.mime.startsWith('image/jpeg') ? 'image/jpeg'
              : fetched.mime.startsWith('image/png') ? 'image/png'
              : fetched.mime.startsWith('image/webp') ? 'image/webp'
              : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
            data: fetched.data,
          },
        },
        { type: 'text', text: PROMPT },
      ],
    }],
  });
  const txt = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();

  let parsed: LabelResult;
  try {
    // Strip ``` fences if Claude added them despite instructions
    const clean = txt.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`invalid_ai_response: ${txt.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.tags)) parsed.tags = [];
  parsed.tags = parsed.tags.map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12);
  if (typeof parsed.caption !== 'string') parsed.caption = '';
  if (typeof parsed.quality_score !== 'number') parsed.quality_score = 0;
  parsed.quality_score = Math.max(0, Math.min(10, Math.round(parsed.quality_score)));

  return parsed;
}

export async function processQueuedJobs(maxJobs = 5): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  results: Array<{ asset_id: string; status: 'succeeded' | 'failed'; error?: string }>;
}> {
  const sb = supabaseAdmin();
  const { data: jobs } = await sb
    .from('beithady_gallery_label_jobs')
    .select('id, asset_id, attempts')
    .eq('status', 'queued')
    .order('enqueued_at', { ascending: true })
    .limit(maxJobs);
  const queued = (jobs as Array<{ id: string; asset_id: string; attempts: number }> | null) || [];
  const results: Array<{ asset_id: string; status: 'succeeded' | 'failed'; error?: string }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const job of queued) {
    // Mark running
    await sb
      .from('beithady_gallery_label_jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq('id', job.id);

    try {
      const { data: asset } = await sb
        .from('beithady_gallery_assets')
        .select('id, storage_bucket, storage_path, mime_type')
        .eq('id', job.asset_id)
        .maybeSingle();
      if (!asset) throw new Error('asset_not_found');
      const a = asset as { id: string; storage_bucket: string; storage_path: string; mime_type: string | null };
      if (!a.mime_type || !a.mime_type.startsWith('image/')) {
        // Skip non-images for now; mark succeeded with empty tags so the
        // queue clears.
        await sb
          .from('beithady_gallery_assets')
          .update({
            ai_processed_at: new Date().toISOString(),
            ai_model: MODEL,
            ai_caption: a.mime_type?.startsWith('video/') ? '[video — labeling not yet supported]' : '[unsupported mime]',
          })
          .eq('id', a.id);
        await sb
          .from('beithady_gallery_label_jobs')
          .update({
            status: 'succeeded',
            finished_at: new Date().toISOString(),
            result: { skipped: 'non_image' },
          })
          .eq('id', job.id);
        succeeded += 1;
        results.push({ asset_id: a.id, status: 'succeeded' });
        continue;
      }

      const labeled = await labelImage(a.storage_bucket as GalleryBucket, a.storage_path);
      await sb
        .from('beithady_gallery_assets')
        .update({
          ai_tags: labeled.tags,
          ai_caption: labeled.caption,
          ai_quality_score: labeled.quality_score,
          ai_processed_at: new Date().toISOString(),
          ai_model: MODEL,
        })
        .eq('id', a.id);
      await sb
        .from('beithady_gallery_label_jobs')
        .update({
          status: 'succeeded',
          finished_at: new Date().toISOString(),
          result: labeled as unknown as object,
        })
        .eq('id', job.id);
      succeeded += 1;
      results.push({ asset_id: a.id, status: 'succeeded' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const newAttempts = job.attempts + 1;
      const finalStatus: 'failed' | 'queued' = newAttempts >= 3 ? 'failed' : 'queued';
      await sb
        .from('beithady_gallery_label_jobs')
        .update({
          status: finalStatus,
          last_error: msg.slice(0, 500),
          finished_at: finalStatus === 'failed' ? new Date().toISOString() : null,
        })
        .eq('id', job.id);
      failed += 1;
      results.push({ asset_id: job.asset_id, status: 'failed', error: msg });
    }
  }

  return { attempted: queued.length, succeeded, failed, results };
}

export async function queueLabelJob(assetId: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb
    .from('beithady_gallery_label_jobs')
    .upsert({ asset_id: assetId, status: 'queued', enqueued_at: new Date().toISOString(), attempts: 0 }, { onConflict: 'asset_id' });
}
