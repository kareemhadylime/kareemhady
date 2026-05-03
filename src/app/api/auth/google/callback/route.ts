import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, getAuthorizingEmail } from '@/lib/gmail';
import { encrypt } from '@/lib/crypto';
import { supabaseAdmin } from '@/lib/supabase';

// Maps the authorizing email's domain to the user-visible label shown
// in the dashboard. Personal mailboxes use these short tags; non-
// personal accounts get a generic `<local-part>` upper-cased.
function deriveDisplayName(email: string): string {
  const lower = email.toLowerCase();
  if (lower.endsWith('@gmail.com')) return 'GMAIL';
  if (lower.includes('@lime-investments') || lower.includes('@lime.')) return 'LIME';
  if (lower.includes('@fmplus')) return 'FM+';
  return email.split('@')[0].toUpperCase();
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const cookieState = req.cookies.get('oauth_state')?.value;

  // State format: `${csrf}.${domain}` (domain may be empty).
  const dotIdx = state.indexOf('.');
  const csrfPart = dotIdx === -1 ? state : state.slice(0, dotIdx);
  const domainPart = dotIdx === -1 ? '' : state.slice(dotIdx + 1);
  if (!code || !csrfPart || csrfPart !== cookieState) {
    return NextResponse.json({ error: 'invalid_state' }, { status: 400 });
  }

  const domain = domainPart === 'personal' ? 'personal' : null;

  const tokens = await exchangeCode(code);
  if (!tokens.refresh_token) {
    return NextResponse.json(
      {
        error: 'no_refresh_token',
        hint:
          'Google only returns a refresh token on first consent. Revoke this app at https://myaccount.google.com/permissions and try again.',
      },
      { status: 400 }
    );
  }

  const email = await getAuthorizingEmail(tokens.access_token!);

  const sb = supabaseAdmin();
  const { error } = await sb.from('accounts').upsert(
    {
      email,
      provider: 'gmail',
      oauth_refresh_token_encrypted: encrypt(tokens.refresh_token),
      oauth_access_token_encrypted: tokens.access_token
        ? encrypt(tokens.access_token)
        : null,
      access_token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      domain,
      display_name: deriveDisplayName(email),
      enabled: true,
    },
    { onConflict: 'email' }
  );

  if (error) {
    return NextResponse.json({ error: 'db_error', details: error }, { status: 500 });
  }

  return NextResponse.redirect(new URL('/?connected=' + encodeURIComponent(email), req.url));
}
