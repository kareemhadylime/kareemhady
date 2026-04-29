import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getAccessToken } from '@/lib/guesty';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Phase Q.4 follow-up — attachment proxy.
//
// Guesty's CDN at assets.guesty.com requires authentication; public GETs
// return HTTP 400. Browsers can't send our service-account Bearer token
// directly. So this route proxies: client GETs our /guesty-attachment
// endpoint with the relative storage path → we fetch the binary using
// our service token → stream it back to the browser with the right
// Content-Type.
//
// Path format expected: production/<accountId>/<type>/<filename>
//
// Security: requires communication:read perm on the calling user, and
// the path is validated to ensure it's a Guesty storage path (no SSRF).

const PATH_PATTERN = /^[a-zA-Z0-9_./-]+$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const API_BASE = 'https://open-api.guesty.com/v1';

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  pdf: 'application/pdf',
};

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 });
  const allowed = user.is_admin
    || (await hasBeithadyPermission(user, 'communication', 'read'));
  if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const path = req.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ ok: false, error: 'missing_path' }, { status: 400 });
  }
  if (!PATH_PATTERN.test(path) || path.includes('..')) {
    return NextResponse.json({ ok: false, error: 'invalid_path' }, { status: 400 });
  }

  const attachmentId = req.nextUrl.searchParams.get('attachmentId');
  const postId = req.nextUrl.searchParams.get('postId');
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  // Validate IDs against pattern (Mongo ObjectIds are alnum, but UUIDs use hyphens)
  for (const id of [attachmentId, postId, conversationId]) {
    if (id && !ID_PATTERN.test(id)) {
      return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
    }
  }

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'token_failed' },
      { status: 500 },
    );
  }

  const cleanPath = path.replace(/^\/+/, '');

  // Build the candidate URL list. Most-likely-to-work first.
  // Guesty Open API is at open-api.guesty.com; assets.guesty.com is the
  // CDN that 400s on direct GETs. The API endpoints might either return
  // the binary directly or a 302 redirect to a signed URL.
  type Candidate = { url: string; auth: 'bearer' | 'none'; label: string };
  const candidates: Candidate[] = [];
  if (conversationId && postId && attachmentId) {
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts/${postId}/attachments/${attachmentId}`,
      auth: 'bearer',
      label: 'api-conv-post-att',
    });
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts/${postId}/attachments/${attachmentId}/download`,
      auth: 'bearer',
      label: 'api-conv-post-att-download',
    });
  }
  if (attachmentId) {
    candidates.push({
      url: `${API_BASE}/communication/attachments/${attachmentId}`,
      auth: 'bearer',
      label: 'api-attachments-id',
    });
    candidates.push({
      url: `${API_BASE}/attachments/${attachmentId}`,
      auth: 'bearer',
      label: 'api-attachments-id-bare',
    });
  }
  // Path-based fallbacks
  candidates.push({ url: `${API_BASE}/${cleanPath}`, auth: 'bearer', label: 'api-path' });
  candidates.push({ url: `https://assets.guesty.com/${cleanPath}`, auth: 'none', label: 'cdn-assets-noauth' });
  candidates.push({ url: `https://assets.guesty.com/${cleanPath}`, auth: 'bearer', label: 'cdn-assets-bearer' });
  candidates.push({ url: `https://app-public-cdn.guesty.com/${cleanPath}`, auth: 'none', label: 'cdn-public-noauth' });

  const failures: Array<{ label: string; url: string; status: number; body: string | null }> = [];

  for (const cand of candidates) {
    try {
      const headers: Record<string, string> = { accept: '*/*' };
      if (cand.auth === 'bearer') headers.authorization = `Bearer ${token}`;
      const upstream = await fetch(cand.url, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.ok && upstream.body) {
        const upContentType = upstream.headers.get('content-type') || '';
        // If the API returned JSON instead of binary, that's likely a
        // signed-URL response or an error — don't pipe JSON to <img>.
        if (upContentType.includes('application/json')) {
          const text = await upstream.text();
          // Try to extract a download URL from the JSON
          try {
            const j = JSON.parse(text) as Record<string, unknown>;
            const signedUrl = (j.url || j.downloadUrl || j.signedUrl || (j.data as Record<string, unknown> | undefined)?.url) as string | undefined;
            if (typeof signedUrl === 'string' && signedUrl.startsWith('http')) {
              // Server-side fetch the signed URL and stream that back
              const signed = await fetch(signedUrl, { method: 'GET', signal: AbortSignal.timeout(15_000) });
              if (signed.ok && signed.body) {
                const signedCt = signed.headers.get('content-type') || mimeFromPath(cleanPath);
                return new Response(signed.body, {
                  status: 200,
                  headers: {
                    'content-type': signedCt,
                    'cache-control': 'private, max-age=3600',
                  },
                });
              }
            }
          } catch {
            // not JSON; fall through to failure
          }
          failures.push({ label: cand.label, url: cand.url, status: upstream.status, body: text.slice(0, 200) });
          continue;
        }

        const contentType = upContentType || mimeFromPath(cleanPath);
        const contentLength = upstream.headers.get('content-length');
        const respHeaders: Record<string, string> = {
          'content-type': contentType,
          'cache-control': 'private, max-age=3600',
        };
        if (contentLength) respHeaders['content-length'] = contentLength;
        return new Response(upstream.body, { status: 200, headers: respHeaders });
      }
      let body: string | null = null;
      try { body = (await upstream.text()).slice(0, 200); } catch { /* ignore */ }
      failures.push({ label: cand.label, url: cand.url, status: upstream.status, body });
    } catch (e) {
      failures.push({
        label: cand.label,
        url: cand.url,
        status: 0,
        body: e instanceof Error ? e.message : 'fetch_failed',
      });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'all_candidates_failed',
      attempts: failures,
      path: cleanPath,
    },
    { status: 502 },
  );
}
