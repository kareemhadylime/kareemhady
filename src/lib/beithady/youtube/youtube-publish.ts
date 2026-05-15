// src/lib/beithady/youtube/youtube-publish.ts
import { getYouTubeAccessToken } from './youtube-client';
import {
  PublishInput, PublishedVideo, YouTubeUploadError, YouTubeAuthError, YouTubeQuotaError,
  SYNC_DURATION_MAX_S, SYNC_SIZE_MAX_BYTES, CHUNK_SIZE_BYTES, CHUNK_BUDGET_MS,
} from './types';
import { supabaseAdmin } from '@/lib/supabase';

export function parseRangeEnd(headerValue: string | null): number {
  if (!headerValue) return -1;
  const m = headerValue.match(/bytes=\d+-(\d+)/);
  return m ? Number(m[1]) : -1;
}

export function decideUploadPath(input: {
  duration_seconds: number | undefined;
  file_size_bytes: number;
}): 'sync' | 'async' {
  const dur = input.duration_seconds ?? Number.POSITIVE_INFINITY;
  if (dur > SYNC_DURATION_MAX_S) return 'async';
  if (input.file_size_bytes > SYNC_SIZE_MAX_BYTES) return 'async';
  return 'sync';
}

export async function fetchVideoBytes(sourceUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new YouTubeUploadError(`fetch_video_failed: ${res.status}`);
  return await res.arrayBuffer();
}

export async function fetchRangedBytes(sourceUrl: string, start: number, endInclusive: number): Promise<ArrayBuffer> {
  const res = await fetch(sourceUrl, { headers: { Range: `bytes=${start}-${endInclusive}` } });
  if (!res.ok && res.status !== 206) throw new YouTubeUploadError(`fetch_range_failed: ${res.status}`);
  return await res.arrayBuffer();
}

type InitInput = Pick<PublishInput,
  | 'title' | 'description' | 'tags' | 'category_id' | 'privacy_status' | 'language' | 'file_size_bytes'
>;

export async function initResumableSession(accountId: number, input: InitInput): Promise<string> {
  const accessToken = await getYouTubeAccessToken(accountId);
  const res = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(input.file_size_bytes),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: {
          title: input.title,
          description: input.description ?? '',
          tags: input.tags ?? [],
          categoryId: String(input.category_id),
          defaultLanguage: input.language,
          defaultAudioLanguage: input.language,
        },
        status: {
          privacyStatus: input.privacy_status,
          selfDeclaredMadeForKids: false,
          embeddable: true,
        },
      }),
    }
  );
  if (res.status === 401) throw new YouTubeAuthError('refresh_failed');
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('quotaExceeded')) throw new YouTubeQuotaError();
    throw new YouTubeUploadError(`init_forbidden: ${body}`, false);
  }
  if (!res.ok) {
    throw new YouTubeUploadError(`init_failed: ${res.status} ${await res.text()}`);
  }
  const sessionUrl = res.headers.get('Location');
  if (!sessionUrl) throw new YouTubeUploadError('init_failed: no_session_url');
  return sessionUrl;
}

export async function publishSync(accountId: number, input: PublishInput): Promise<PublishedVideo> {
  const bytes = await fetchVideoBytes(input.source_url);
  if (bytes.byteLength !== input.file_size_bytes) {
    throw new YouTubeUploadError(`size_mismatch: expected ${input.file_size_bytes} got ${bytes.byteLength}`);
  }

  const sessionUrl = await initResumableSession(accountId, {
    title: input.title,
    description: input.description ?? '',
    tags: input.tags ?? [],
    category_id: input.category_id,
    privacy_status: input.privacy_status,
    language: input.language,
    file_size_bytes: input.file_size_bytes,
  });

  const uploadResp = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(bytes.byteLength),
      'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body: bytes,
  });

  if (uploadResp.status === 401) throw new YouTubeAuthError('refresh_failed');
  if (!uploadResp.ok) {
    throw new YouTubeUploadError(`sync_put_failed: ${uploadResp.status} ${await uploadResp.text()}`);
  }

  const video = await uploadResp.json() as { id: string; status?: { uploadStatus?: string } };
  return {
    video_id: video.id,
    watch_url: `https://youtu.be/${video.id}`,
    upload_status: video.status?.uploadStatus,
  };
}

export type ChunkLoopRow = {
  id: number;
  source_url: string;
  upload_session_url: string;
  chunk_offset: number;
  file_size_bytes: number;
};

export type ChunkLoopResult =
  | { done: false; final_offset: number }
  | { done: true; video_id: string };

export async function sendChunksUntilBudget(row: ChunkLoopRow): Promise<ChunkLoopResult> {
  const startMs = Date.now();
  let offset = row.chunk_offset;
  const total = row.file_size_bytes;
  const sb = supabaseAdmin();

  while (offset < total && Date.now() - startMs < CHUNK_BUDGET_MS) {
    const end = Math.min(offset + CHUNK_SIZE_BYTES, total);
    const chunkBytes = await fetchRangedBytes(row.source_url, offset, end - 1);

    const resp = await fetch(row.upload_session_url, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - offset),
        'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
      },
      body: chunkBytes,
    });

    if (resp.status === 308) {
      const nextEnd = parseRangeEnd(resp.headers.get('Range'));
      offset = nextEnd >= 0 ? nextEnd + 1 : end;
      await sb.from('ads_youtube_videos').update({ chunk_offset: offset, updated_at: new Date().toISOString() }).eq('id', row.id);
    } else if (resp.status === 200 || resp.status === 201) {
      const video = await resp.json() as { id: string };
      return { done: true, video_id: video.id };
    } else if (resp.status === 401) {
      throw new YouTubeAuthError('refresh_failed');
    } else {
      throw new YouTubeUploadError(`chunk_failed: ${resp.status} ${await resp.text()}`);
    }
  }

  return { done: false, final_offset: offset };
}
