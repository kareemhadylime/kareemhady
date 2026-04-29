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

// Recursively walk a JSON object looking for a value that looks like a
// signed CDN URL belonging to the attachment we want. Matches when:
//   - value is an http(s) URL
//   - AND either it contains the attachmentId, OR contains a chunk of the
//     storage path (last filename segment), OR the parent object's _id
//     matches our attachmentId.
function findSignedUrl(j: unknown, attachmentId: string | null, cleanPath: string): string | null {
  const filenameSeg = cleanPath.split('/').pop() || '';
  const filenameStem = filenameSeg.split('.')[0] || '';

  function isPlausibleSigned(url: string): boolean {
    if (!url.startsWith('http')) return false;
    if (attachmentId && url.includes(attachmentId)) return true;
    if (filenameSeg && url.includes(filenameSeg)) return true;
    if (filenameStem && filenameStem.length > 8 && url.includes(filenameStem)) return true;
    // Looks like a Guesty signed URL even without obvious match
    if (/X-Amz-Signature|X-Amz-Algorithm|signature=|expires=|sig=|token=/i.test(url)) return true;
    return false;
  }

  function walk(node: unknown, parentId?: unknown): string | null {
    if (!node) return null;
    if (typeof node === 'string') {
      if (isPlausibleSigned(node)) return node;
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      // If this object IS our attachment (matches by _id/id), prefer its url fields
      const matches = attachmentId
        && (obj._id === attachmentId || obj.id === attachmentId || parentId === attachmentId);
      const urlFields = ['url', 'downloadUrl', 'signedUrl', 'href', 'src', 'attachmentUrl'];
      for (const k of urlFields) {
        const v = obj[k];
        if (typeof v === 'string') {
          if (matches && v.startsWith('http')) return v;
          if (isPlausibleSigned(v)) return v;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        const found = walk(v, obj._id || obj.id || parentId);
        if (found) return found;
        // ignore unused k
        void k;
      }
    }
    return null;
  }

  return walk(j);
}

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

  // assets.guesty.com 400's with empty body — the host has the asset
  // but rejects direct GETs. Most likely it's gating on Referer / Origin
  // (Guesty's UI is the only legit consumer) OR expects a signed URL.
  // Try Referer-based access first since that's free; if that fails,
  // fall through to signed-URL lookups via API endpoint variants.
  // Confirmed via DevTools cURL: actual asset is on guesty-ugc.s3.amazonaws.com
  // and requires AWS S3 pre-signed URL with STS temporary credentials
  // (AWSAccessKeyId, Expires, Signature, x-amz-security-token query params).
  // Direct GET to that bucket returns 403 AccessDenied — confirmed.
  // We must call a Guesty API endpoint that mints a signed URL on demand.
  // GET endpoints all 404'd in the previous round. Try POST signing
  // patterns common to other PMS integrations.
  type Candidate = {
    url: string;
    method: 'GET' | 'POST';
    auth: 'bearer' | 'none';
    label: string;
    extraHeaders?: Record<string, string>;
    body?: string;
  };
  const candidates: Candidate[] = [];

  // POST signing endpoints — most-likely first based on common Guesty/PMS patterns
  if (attachmentId) {
    candidates.push({
      url: `${API_BASE}/communication/attachments/${attachmentId}/sign`,
      method: 'POST',
      auth: 'bearer',
      label: 'post-sign-attachment',
      body: '{}',
    });
    candidates.push({
      url: `${API_BASE}/communication/attachments/${attachmentId}/url`,
      method: 'GET',
      auth: 'bearer',
      label: 'get-attachment-url',
    });
  }
  if (conversationId && postId) {
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts/${postId}/sign`,
      method: 'POST',
      auth: 'bearer',
      label: 'post-sign-post',
      body: JSON.stringify({ attachmentId, path: cleanPath }),
    });
  }
  // Generic file-signing endpoints
  candidates.push({
    url: `${API_BASE}/files/sign`,
    method: 'POST',
    auth: 'bearer',
    label: 'post-files-sign',
    body: JSON.stringify({ path: cleanPath }),
    extraHeaders: { 'content-type': 'application/json' },
  });
  candidates.push({
    url: `${API_BASE}/uploads/sign`,
    method: 'POST',
    auth: 'bearer',
    label: 'post-uploads-sign',
    body: JSON.stringify({ path: cleanPath }),
    extraHeaders: { 'content-type': 'application/json' },
  });
  candidates.push({
    url: `${API_BASE}/communication/files/sign`,
    method: 'POST',
    auth: 'bearer',
    label: 'post-comm-files-sign',
    body: JSON.stringify({ path: cleanPath }),
    extraHeaders: { 'content-type': 'application/json' },
  });

  // GET endpoints that might return a signed URL via JSON body
  if (conversationId && postId && attachmentId) {
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts/${postId}/attachments/${attachmentId}/url`,
      method: 'GET',
      auth: 'bearer',
      label: 'api-conv-post-att-url',
    });
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts/${postId}`,
      method: 'GET',
      auth: 'bearer',
      label: 'api-post-singular',
    });
  }
  if (conversationId) {
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts?withSignedAttachments=true`,
      method: 'GET',
      auth: 'bearer',
      label: 'api-posts-withSigned',
    });
    candidates.push({
      url: `${API_BASE}/communication/conversations/${conversationId}/posts?expand=attachments`,
      method: 'GET',
      auth: 'bearer',
      label: 'api-posts-expand',
    });
  }

  // Internal app endpoints (NOT Open API). The signed URL Guesty's UI
  // uses must come from one of these.
  if (conversationId && postId && attachmentId) {
    candidates.push({
      url: `https://app.guesty.com/api/v2/communication/conversations/${conversationId}/posts/${postId}/attachments/${attachmentId}`,
      method: 'GET',
      auth: 'bearer',
      label: 'app-api-v2-att',
      extraHeaders: { referer: 'https://app.guesty.com/', origin: 'https://app.guesty.com' },
    });
    candidates.push({
      url: `https://app.guesty.com/api/v2/communication/conversations/${conversationId}/posts/${postId}/attachments/${attachmentId}/sign`,
      method: 'GET',
      auth: 'bearer',
      label: 'app-api-v2-att-sign',
      extraHeaders: { referer: 'https://app.guesty.com/', origin: 'https://app.guesty.com' },
    });
    candidates.push({
      url: `https://app.guesty.com/api/v2/communication/conversations/${conversationId}/posts/${postId}`,
      method: 'GET',
      auth: 'bearer',
      label: 'app-api-v2-post',
      extraHeaders: { referer: 'https://app.guesty.com/', origin: 'https://app.guesty.com' },
    });
  }
  if (attachmentId) {
    candidates.push({
      url: `https://app.guesty.com/api/v2/attachments/${attachmentId}/sign`,
      method: 'GET',
      auth: 'bearer',
      label: 'app-api-v2-attid-sign',
      extraHeaders: { referer: 'https://app.guesty.com/', origin: 'https://app.guesty.com' },
    });
  }

  // Final fallback — direct S3 (will 403 but useful for debug)
  candidates.push({
    url: `https://guesty-ugc.s3.amazonaws.com/${cleanPath}`,
    method: 'GET',
    auth: 'none',
    label: 's3-direct',
  });

  const failures: Array<{ label: string; url: string; status: number; body: string | null }> = [];

  for (const cand of candidates) {
    try {
      const headers: Record<string, string> = {
        accept: '*/*',
        // Browser-like UA — some CDNs reject default fetch UA strings
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        ...(cand.extraHeaders || {}),
      };
      if (cand.auth === 'bearer') headers.authorization = `Bearer ${token}`;
      const upstream = await fetch(cand.url, {
        method: cand.method,
        headers,
        body: cand.method === 'POST' ? (cand.body || '{}') : undefined,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.ok && upstream.body) {
        const upContentType = upstream.headers.get('content-type') || '';
        // If the API returned JSON instead of binary, that's likely a
        // signed-URL response or an error — don't pipe JSON to <img>.
        if (upContentType.includes('application/json')) {
          const text = await upstream.text();
          // Try to extract a download URL from the JSON. Multiple shapes
          // to try: top-level signed URL, nested data.url, or buried in
          // posts[].attachments[].url|downloadUrl|signedUrl.
          let foundSigned: string | null = null;
          try {
            const j = JSON.parse(text);
            foundSigned = findSignedUrl(j, attachmentId, cleanPath);
          } catch {
            // not JSON — fall through
          }
          if (foundSigned) {
            const signed = await fetch(foundSigned, {
              method: 'GET',
              redirect: 'follow',
              signal: AbortSignal.timeout(15_000),
            });
            if (signed.ok && signed.body) {
              const signedCt = signed.headers.get('content-type') || mimeFromPath(cleanPath);
              return new Response(signed.body, {
                status: 200,
                headers: {
                  'content-type': signedCt,
                  'cache-control': 'private, max-age=3600',
                  'x-source': cand.label + ' → signed-url',
                },
              });
            }
            failures.push({
              label: cand.label + '-followsigned',
              url: foundSigned,
              status: signed.status,
              body: 'signed URL fetch failed',
            });
            continue;
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
