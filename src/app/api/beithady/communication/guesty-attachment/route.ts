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

const ALLOWED_HOSTS = [
  'https://assets.guesty.com',
  'https://app-public-cdn.guesty.com',
  'https://public-cdn.guesty.com',
  'https://cdn.guesty.com',
  'https://media.guesty.com',
];

const PATH_PATTERN = /^[a-zA-Z0-9_./-]+$/;

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

  // Try each candidate host in order until one returns 2xx.
  // First success is cached implicitly by the Lambda warm container
  // (no module-scope cache here because failures should re-probe quickly).
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
  let lastStatus = 0;
  let lastBody: string | null = null;

  for (const host of ALLOWED_HOSTS) {
    const url = `${host}/${cleanPath}`;
    try {
      const upstream = await fetch(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          // Some Guesty CDN paths gate on Origin/Referer
          accept: '*/*',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (upstream.ok && upstream.body) {
        // Stream the binary back. Content-Type from upstream if present,
        // else infer from path extension.
        const contentType = upstream.headers.get('content-type') || mimeFromPath(cleanPath);
        const contentLength = upstream.headers.get('content-length');
        const headers: Record<string, string> = {
          'content-type': contentType,
          // 1h client cache; per-Lambda re-fetch is cheap
          'cache-control': 'private, max-age=3600',
        };
        if (contentLength) headers['content-length'] = contentLength;
        return new Response(upstream.body, { status: 200, headers });
      }
      lastStatus = upstream.status;
      // Capture a small snippet of the error body for debugging
      try {
        const text = await upstream.text();
        lastBody = text.slice(0, 200);
      } catch {
        // ignore
      }
    } catch (e) {
      lastBody = e instanceof Error ? e.message : 'fetch_failed';
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: 'all_hosts_failed',
      last_status: lastStatus,
      last_body: lastBody,
      path: cleanPath,
    },
    { status: 502 },
  );
}
