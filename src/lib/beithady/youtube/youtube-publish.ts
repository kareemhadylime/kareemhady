// src/lib/beithady/youtube/youtube-publish.ts
import { getYouTubeAccessToken } from './youtube-client';
import {
  PublishInput, PublishedVideo, YouTubeUploadError, YouTubeAuthError, YouTubeQuotaError,
  SYNC_DURATION_MAX_S, SYNC_SIZE_MAX_BYTES,
} from './types';

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
