import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth-constants';

// Gate every route behind /login except:
//   - /login page + its POST action
//   - /api/auth/*  (login/logout)
//   - /api/cron/*  (bearer-auth via CRON_SECRET)
//   - /api/webhooks/* (HMAC-verified)
//   - anything under /api/*/ping (bearer-auth smoke tests)
//   - /api/shopify/auth/* (Shopify OAuth callback)
//   - static assets and internal Next files
//
// Also: stamps a `boat_rental_last_portal` cookie whenever the user
// navigates into one of the three boat-rental portals (admin / broker
// / owner). The login route reads it so multi-role users land back on
// whichever portal they last used.
//
// The cookie is opaque — this proxy does NOT validate the session
// against Supabase (edge can't do service-role queries cleanly). Actual
// session lookup happens server-side in getCurrentUser(). Missing cookie
// alone is enough to send users to /login.

const BOAT_PORTAL_RE = /^\/emails\/boat-rental\/(admin|broker|owner)(?:\/|$)/;
const LAST_PORTAL_COOKIE = 'boat_rental_last_portal';
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

function maybeStampLastPortal(req: NextRequest, res: NextResponse): NextResponse {
  const m = req.nextUrl.pathname.match(BOAT_PORTAL_RE);
  if (!m) return res;
  const portal = m[1];
  if (req.cookies.get(LAST_PORTAL_COOKIE)?.value === portal) return res;
  res.cookies.set({
    name: LAST_PORTAL_COOKIE,
    value: portal,
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_YEAR_SEC,
  });
  return res;
}

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
// Letting them through the proxy keeps the smoke-test curl commands working.
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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (BEARER_API_PATTERNS.some(r => r.test(pathname))) {
    return NextResponse.next();
  }

  const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasCookie) {
    return maybeStampLastPortal(req, NextResponse.next());
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip static files + Next internals entirely.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
