'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { parseSocialUrl } from '@/lib/beithady/social-url';
import { fetchTikTokOEmbed } from '@/lib/beithady/tiktok-oembed';

const PAGE = '/beithady/ads/tiktok/organic';

async function requireFull() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'full'));
  if (!allowed) throw new Error('forbidden');
  return user;
}

function backWith(params: Record<string, string | null | undefined>): never {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, v);
  }
  redirect(`${PAGE}${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export async function addReelAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const rawUrl = String(formData.get('url') || '');
  const caption = String(formData.get('caption') || '').trim() || null;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const sortOrderRaw = String(formData.get('sort_order') || '').trim();
  const sortOrder = sortOrderRaw && Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

  const parsed = parseSocialUrl(rawUrl);
  if (!parsed.ok) backWith({ error: parsed.message });

  // Auto-fetch metadata (best-effort, ~5s timeout). TikTok has a public
  // oEmbed endpoint; Instagram's oEmbed needs a Meta Graph token so we
  // skip it in v1 and rely on the embed itself for caption rendering.
  let title: string | null = null;
  let authorName: string | null = null;
  let authorUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  if (parsed.platform === 'tiktok') {
    const meta = await fetchTikTokOEmbed(parsed.canonicalUrl);
    title = meta.title;
    authorName = meta.author_name;
    authorUrl = meta.author_url;
    thumbnailUrl = meta.thumbnail_url;
  } else if (parsed.platform === 'instagram') {
    // No metadata fetch (requires Graph token); fall back to URL-derived author hint.
    // Username isn't always in the IG canonical URL we store, so leave null.
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('bh_marketing_reels')
    .insert({
      platform: parsed.platform,
      url: parsed.canonicalUrl,
      external_id: parsed.externalId,
      caption: caption || title, // user-supplied wins over oEmbed
      building_code: buildingCode,
      sort_order: sortOrder,
      is_visible: true,
      thumbnail_url: thumbnailUrl,
      author_name: authorName,
      author_url: authorUrl,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') backWith({ error: 'That reel is already in the list.' });
    backWith({ error: `Could not add reel: ${error.message}` });
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: `${parsed.platform}_reel_added`,
    target_type: 'bh_marketing_reel',
    target_id: String((data as { id: number }).id),
    metadata: {
      platform: parsed.platform,
      url: parsed.canonicalUrl,
      building_code: buildingCode,
      oembed_caption_used: !caption && !!title,
    },
  });

  revalidatePath(PAGE);
  backWith({ added: String((data as { id: number }).id) });
}

export async function updateReelAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) backWith({ error: 'Missing reel id.' });

  const caption = String(formData.get('caption') || '').trim() || null;
  const buildingCode = String(formData.get('building_code') || '').trim() || null;
  const sortOrderRaw = String(formData.get('sort_order') || '').trim();
  const sortOrder = sortOrderRaw && Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('bh_marketing_reels')
    .update({
      caption,
      building_code: buildingCode,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) backWith({ error: `Could not update reel: ${error.message}` });

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'marketing_reel_updated',
    target_type: 'bh_marketing_reel',
    target_id: String(id),
    metadata: { caption, building_code: buildingCode, sort_order: sortOrder },
  });

  revalidatePath(PAGE);
  backWith({ updated: String(id) });
}

export async function toggleReelVisibilityAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) backWith({ error: 'Missing reel id.' });

  const sb = supabaseAdmin();
  const { data: current, error: readErr } = await sb
    .from('bh_marketing_reels')
    .select('is_visible')
    .eq('id', id)
    .single();
  if (readErr || !current) backWith({ error: 'Reel not found.' });

  const next = !(current as { is_visible: boolean }).is_visible;
  const { error } = await sb
    .from('bh_marketing_reels')
    .update({ is_visible: next, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) backWith({ error: `Could not toggle: ${error.message}` });

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: next ? 'marketing_reel_shown' : 'marketing_reel_hidden',
    target_type: 'bh_marketing_reel',
    target_id: String(id),
  });

  revalidatePath(PAGE);
  backWith({});
}

export async function deleteReelAction(formData: FormData): Promise<void> {
  const user = await requireFull();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) backWith({ error: 'Missing reel id.' });

  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from('bh_marketing_reels')
    .select('url, external_id, building_code')
    .eq('id', id)
    .single();

  const { error } = await sb.from('bh_marketing_reels').delete().eq('id', id);
  if (error) backWith({ error: `Could not delete: ${error.message}` });

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: 'marketing_reel_deleted',
    target_type: 'bh_marketing_reel',
    target_id: String(id),
    before: before ?? null,
  });

  revalidatePath(PAGE);
  backWith({ deleted: String(id) });
}
