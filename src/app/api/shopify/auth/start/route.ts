import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

// Step 1 of Shopify OAuth — build the authorize URL and redirect the user.
// Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-token-types/oauth
//
// Prereqs:
//   - SHOPIFY_APP_CLIENT_ID (from Dev Dashboard → app → Settings → Credentials)
//   - SHOPIFY_APP_CLIENT_SECRET
//   - SHOPIFY_STORE_DOMAIN (short handle, e.g. 'kika-swim-wear')
//   - Register redirect URL in Dev Dashboard Configuration:
//       https://kareemhady.vercel.app/api/shopify/auth/callback
//       http://localhost:3000/api/shopify/auth/callback  (dev only)
//
// Usage: open /api/shopify/auth/start in a browser while logged into Shopify.
// You'll be prompted to install the app on the kika-swim-wear store. After
// approving, Shopify redirects to /callback which completes the exchange.

const SCOPES = [
  'read_orders',
  'read_products',
  'read_customers',
  'read_inventory',
  'read_locations',
];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = process.env.SHOPIFY_APP_CLIENT_ID;
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: 'SHOPIFY_APP_CLIENT_ID not configured' },
      { status: 500 }
    );
  }
  if (!shop) {
    return NextResponse.json(
      { ok: false, error: 'SHOPIFY_STORE_DOMAIN not configured' },
      { status: 500 }
    );
  }

  const shopHost = shop.includes('.')
    ? shop.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    : `${shop}.myshopify.com`;

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://kareemhady.vercel.app';
  const redirectUri = `${appUrl.replace(/\/+$/, '')}/api/shopify/auth/callback`;

  // CSRF nonce — the callback will verify this matches the cookie.
  const nonce = crypto.randomBytes(16).toString('hex');

  const authorizeUrl = new URL(
    `https://${shopHost}/admin/oauth/authorize`
  );
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('scope', SCOPES.join(','));
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', nonce);
  // Offline access token (default) — doesn't expire, doesn't need refresh.

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set({
    name: 'shopify_oauth_state',
    value: nonce,
    httpOnly: true,
    secure: appUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/api/shopify/auth',
    maxAge: 10 * 60, // 10 min
  });
  return res;
}
