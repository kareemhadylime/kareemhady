// src/app/beithady/gallery/youtube/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { generateYouTubeMetadata, type GenerateInput } from '@/lib/beithady/youtube/ai-metadata';
import { decideUploadPath, publishSync } from '@/lib/beithady/youtube/youtube-publish';
import { PublishInputSchema, type PublishInput } from '@/lib/beithady/youtube/types';

export async function generateMetadataAction(input: GenerateInput) {
  await requireBeithadyPermission('ads', 'full');
  try {
    const result = await generateYouTubeMetadata(input);
    return {
      title: result.title,
      description: result.description,
      tags: result.tags,
      language: result.language,
      cost_usd: result.cost_usd,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function publishYouTubeVideoAction(formData: FormData) {
  await requireBeithadyPermission('ads', 'full');
  const sb = supabaseAdmin();

  const raw: Partial<PublishInput> = {
    account_id: Number(formData.get('account_id')),
    asset_id: (formData.get('asset_id') as string) || undefined,
    building_code: (formData.get('building_code') as string) || undefined,
    source_url: formData.get('source_url') as string,
    file_size_bytes: Number(formData.get('file_size_bytes')),
    duration_seconds: formData.get('duration_seconds')
      ? Number(formData.get('duration_seconds')) : undefined,
    is_shorts: formData.get('is_shorts') === '1',
    title: (formData.get('title') as string).trim(),
    description: (formData.get('description') as string) || undefined,
    tags: String(formData.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean),
    category_id: 19,
    privacy_status: (formData.get('privacy_status') as 'private' | 'unlisted' | 'public') || 'unlisted',
    language: (formData.get('language') as string) || 'en',
    template_id: (formData.get('template_id') as string) || undefined,
    ai_generated: formData.get('ai_generated') === '1',
    ai_cost_usd: formData.get('ai_cost_usd') ? Number(formData.get('ai_cost_usd')) : undefined,
  };

  const parsed = PublishInputSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/beithady/gallery/youtube?error=${encodeURIComponent('invalid_input: ' + parsed.error.message)}`);
  }
  const input = parsed.data;

  const path = decideUploadPath({ duration_seconds: input.duration_seconds, file_size_bytes: input.file_size_bytes });

  // Insert row in starting state for both paths
  const initialStatus = path === 'sync' ? 'uploading' : 'queued';
  const { data: inserted, error: insertErr } = await sb
    .from('ads_youtube_videos')
    .insert({
      account_id: input.account_id,
      asset_id: input.asset_id ?? null,
      building_code: input.building_code ?? null,
      source_url: input.source_url,
      file_size_bytes: input.file_size_bytes,
      duration_seconds: input.duration_seconds ?? null,
      is_shorts: input.is_shorts,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags ?? null,
      category_id: input.category_id,
      privacy_status: input.privacy_status,
      language: input.language,
      template_id: input.template_id ?? null,
      ai_generated: input.ai_generated,
      ai_cost_usd: input.ai_cost_usd ?? null,
      status: initialStatus,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    redirect(`/beithady/gallery/youtube?error=${encodeURIComponent('db_insert_failed')}`);
  }
  const rowId = (inserted as { id: number }).id;

  if (path === 'async') {
    revalidatePath('/beithady/gallery/youtube');
    redirect(`/beithady/gallery/youtube?queued=${rowId}`);
  }

  // Sync path: run upload now
  try {
    const result = await publishSync(input.account_id, input);
    await sb.from('ads_youtube_videos').update({
      status: 'processing',
      youtube_video_id: result.video_id,
      watch_url: result.watch_url,
      chunk_offset: input.file_size_bytes,
      updated_at: new Date().toISOString(),
    }).eq('id', rowId);
    revalidatePath('/beithady/gallery/youtube');
    redirect(`/beithady/gallery/youtube?published=${rowId}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('ads_youtube_videos').update({
      status: 'error',
      error: msg,
      updated_at: new Date().toISOString(),
    }).eq('id', rowId);
    redirect(`/beithady/gallery/youtube?error=${encodeURIComponent(msg)}`);
  }
}

export async function retryUploadAction(formData: FormData) {
  await requireBeithadyPermission('ads', 'full');
  const sb = supabaseAdmin();
  const rowId = Number(formData.get('row_id'));
  if (!rowId) return;
  await sb.from('ads_youtube_videos').update({
    status: 'queued',
    retry_count: 0,
    next_retry_at: null,
    error: null,
    chunk_offset: 0,
    upload_session_url: null,
    updated_at: new Date().toISOString(),
  }).eq('id', rowId);
  revalidatePath('/beithady/gallery/youtube');
}
