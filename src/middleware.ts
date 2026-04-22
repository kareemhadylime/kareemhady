import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

// Gate every route behind /login except:
//   - /login page + its POST action
//   - /api/auth/*  (login/logout)
//   - /api/cron/*  (bearer-auth via CRON_SECRET)
//   - /api/webhooks/* (HMAC-verified)
//   - anything under /api/*/ping (bearer-auth smoke tests)
//   - /api/shopify/auth/* (Shopify OAuth callback)
//   - static assets and internal Next files
//
// The cookie is opaque — this middleware does NOT validate the session
// against Supabase (edge can't do service-role queries cleanly). Actual
// session lookup happens server-side in getCurrentUser(). Missing cookie
// alone is enough to send users to /login.

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',  // covers login, logout, bootstrap
  '/api/cron/',
  '/api/webhooks/',
  '/api/shopify/auth/',
  '/_next/',
  '/favicon',
  '/icon',
  '/apple-icon',
];

// These API routes are bearer-auth protected via CRON_SECRET, not cookie.
// Letting them through middleware keeps the smoke-test curl commands working.
const BEARER_API_PATTERNS = [
  /^\/api\/[^/]+\/ping$/,           // /api/guesty/ping, /api/odoo/ping, etc.
  /^\/api\/guesty\/run-now$/,
  /^\/api\/odoo\/run-now$/,
  /^\/api\/odoo\/sync-financials$/,
  /^\/api\/pricelabs\/run-now$/,
  /^\/api\/shopify\/run-now$/,
  /^\/api\/shopify\/register-webhooks$/,
  /^\/api\/run-now$/,
  /^\/api\/analysis\//,
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (BEARER_API_PATTERNS.some(r => r.test(pathname))) {
    return NextResponse.next();
  }

  const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip static files + Next internals entirely.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
