import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

// Step 2 of Shopify OAuth — validate the callback and exchange `code` for
// an offline access token. Persisted in public.integration_tokens where
// provider = `shopify:{shop}`. `shopifyFetch()` reads from this table when
// SHOPIFY_ADMIN_ACCESS_TOKEN env isn't set.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');
  const state = url.searchParams.get('state');
  const hmac = url.searchParams.get('hmac');
  const timestamp = url.searchParams.get('timestamp');

  if (!code || !shop || !state || !hmac || !timestamp) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'missing required params (code / shop / state / hmac / timestamp)',
      },
      { status: 400 }
    );
  }

  const { getCredential } = await import('@/lib/credentials');
  const clientId = await getCredential('shopify', 'app_client_id');
  const clientSecret = await getCredential('shopify', 'app_client_secret');
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'shopify.app_client_id and shopify.app_client_secret must be set — configure via /admin/integrations',
      },
      { status: 500 }
    );
  }

  // 1. HMAC validation — required by Shopify for all OAuth callbacks.
  // Build the canonical query string (alphabetical, without hmac) and
  // compute HMAC-SHA256 with client_secret as the key.
  const params = new URLSearchParams(url.searchParams);
  params.delete('hmac');
  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const expectedHmac = crypto
    .createHmac('sha256', clientSecret)
    .update(sorted)
    .digest('hex');

  try {
    const received = Buffer.from(hmac, 'hex');
    const expected = Buffer.from(expectedHmac, 'hex');
    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return NextResponse.json(
        { ok: false, error: 'hmac mismatch' },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'hmac decode failed' },
      { status: 401 }
    );
  }

  // 2. State validation — prevents CSRF.
  const cookieState = req.cookies.get('shopify_oauth_state')?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.json(
      { ok: false, error: 'state cookie missing or mismatched' },
      { status: 401 }
    );
  }

  // 3. Shop domain sanity — only accept *.myshopify.com. Prevents an
  // attacker-crafted shop value from proxying the token exchange elsewhere.
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return NextResponse.json(
      { ok: false, error: 'invalid shop domain' },
      { status: 400 }
    );
  }

  // 4. Exchange the authorization code for an offline access token.
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return NextResponse.json(
      {
        ok: false,
        error: `token exchange failed: ${tokenRes.status} ${text.slice(0, 300)}`,
      },
      { status: 500 }
    );
  }
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
  };
  if (!tokenJson.access_token) {
    return NextResponse.json(
      { ok: false, error: 'no access_token in response' },
      { status: 500 }
    );
  }

  // 5. Persist. Offline access tokens don't expire — use a far-future
  // expires_at so the existing integration_tokens schema (NOT NULL) is
  // satisfied without changing the column.
  const shopHandle = shop.replace(/\.myshopify\.com$/i, '');
  const provider = `shopify:${shopHandle}`;
  const farFuture = new Date('2099-12-31T00:00:00Z').toISOString();
  const sb = supabaseAdmin();
  const { error } = await sb.from('integration_tokens').upsert(
    {
      provider,
      access_token: tokenJson.access_token,
      expires_at: farFuture,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'provider' }
  );
  if (error) {
    return NextResponse.json(
      { ok: false, error: `failed to persist token: ${error.message}` },
      { status: 500 }
    );
  }

  // 6. Clear the state cookie and redirect somewhere friendly.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://kareemhady.vercel.app';
  const res = NextResponse.redirect(
    `${appUrl.replace(/\/+$/, '')}/emails/kika?shopify=installed`
  );
  res.cookies.set({
    name: 'shopify_oauth_state',
    value: '',
    httpOnly: true,
    secure: appUrl.startsWith('https'),
    sameSite: 'lax',
    path: '/api/shopify/auth',
    maxAge: 0,
  });
  return res;
}
