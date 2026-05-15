// src/app/api/cron/youtube-uploader/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  initResumableSession,
  sendChunksUntilBudget,
  pollProcessing,
  computeNextRetry,
} from '@/lib/beithady/youtube/youtube-publish';
import {
  YouTubeAuthError,
  YouTubeQuotaError,
  YouTubeRejectedError,
} from '@/lib/beithady/youtube/types';

export const maxDuration = 800;
export const dynamic = 'force-dynamic';

function isCronAuthed(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

type Row = {
  id: number;
  account_id: number;
  source_url: string;
  file_size_bytes: number;
  upload_session_url: string | null;
  chunk_offset: number;
  retry_count: number;
  status: string;
  youtube_video_id: string | null;
  title: string;
  description: string | null;
  tags: string[] | null;
  category_id: number;
  privacy_status: 'private' | 'unlisted' | 'public';
  language: string;
};

export async function GET(req: NextRequest) {
  if (!isCronAuthed(req)) return new Response('unauthorized', { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('ads_youtube_videos')
    .select('id, account_id, source_url, file_size_bytes, upload_session_url, chunk_offset, retry_count, status, youtube_video_id, title, description, tags, category_id, privacy_status, language')
    .in('status', ['queued', 'uploading', 'processing'])
    .or('next_retry_at.is.null,next_retry_at.lte.now()')
    .order('id')
    .limit(3);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data as Row[] | null) || [];
  const results: Array<{ id: number; result: string }> = [];

  for (const row of rows) {
    try {
      if (row.status === 'queued') {
        const sessionUrl = await initResumableSession(row.account_id, {
          title: row.title,
          description: row.description ?? '',
          tags: row.tags ?? [],
          category_id: row.category_id,
          privacy_status: row.privacy_status,
          language: row.language,
          file_size_bytes: row.file_size_bytes,
        });
        await sb.from('ads_youtube_videos').update({
          status: 'uploading',
          upload_session_url: sessionUrl,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        results.push({ id: row.id, result: 'init_ok' });

      } else if (row.status === 'uploading') {
        if (!row.upload_session_url) throw new Error('missing_upload_session_url');
        const r = await sendChunksUntilBudget({
          id: row.id,
          source_url: row.source_url,
          upload_session_url: row.upload_session_url,
          chunk_offset: row.chunk_offset,
          file_size_bytes: row.file_size_bytes,
        });
        if (r.done) {
          await sb.from('ads_youtube_videos').update({
            status: 'processing',
            youtube_video_id: r.video_id,
            watch_url: `https://youtu.be/${r.video_id}`,
            chunk_offset: row.file_size_bytes,
            updated_at: new Date().toISOString(),
          }).eq('id', row.id);
          results.push({ id: row.id, result: 'chunks_done' });
        } else {
          await sb.from('ads_youtube_videos').update({
            chunk_offset: r.final_offset,
            updated_at: new Date().toISOString(),
          }).eq('id', row.id);
          results.push({ id: row.id, result: `chunks_partial_${r.final_offset}` });
        }

      } else if (row.status === 'processing') {
        if (!row.youtube_video_id) throw new Error('missing_video_id');
        const poll = await pollProcessing(row.account_id, row.youtube_video_id);
        if (poll.status === 'published') {
          await sb.from('ads_youtube_videos').update({
            status: 'published',
            published_at: new Date().toISOString(),
            thumbnail_url: poll.thumbnail_url,
          }).eq('id', row.id);
          results.push({ id: row.id, result: 'published' });
        } else if (poll.status === 'error') {
          await sb.from('ads_youtube_videos').update({
            status: 'error',
            error: poll.reason,
          }).eq('id', row.id);
          results.push({ id: row.id, result: `errored_${poll.reason}` });
        } else {
          results.push({ id: row.id, result: 'still_processing' });
        }
      }
    } catch (e) {
      let nextRetryAt: string | null = null;
      let status: string = row.status;
      let errorMsg = e instanceof Error ? e.message : String(e);

      if (e instanceof YouTubeQuotaError) {
        // Quota: retry tomorrow at 00:00 UTC
        const t = new Date();
        t.setUTCHours(24, 0, 0, 0);
        nextRetryAt = t.toISOString();
      } else if (e instanceof YouTubeAuthError) {
        // Refresh failed: stop until operator reconnects
        status = 'error';
        errorMsg = `refresh_failed: ${e.reason}`;
      } else if (e instanceof YouTubeRejectedError) {
        status = 'error';
        errorMsg = `rejected: ${e.rejectionReason}`;
      } else {
        const retry = computeNextRetry(row.retry_count);
        if (retry.terminal) status = 'error';
        else nextRetryAt = new Date(Date.now() + retry.delayMs).toISOString();
      }

      await sb.from('ads_youtube_videos').update({
        retry_count: row.retry_count + 1,
        next_retry_at: nextRetryAt,
        status,
        error: errorMsg,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      results.push({ id: row.id, result: `error_${errorMsg.slice(0, 50)}` });
    }
  }

  return NextResponse.json({ picked: rows.length, results });
}
