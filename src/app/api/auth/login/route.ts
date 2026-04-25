import { NextRequest, NextResponse } from 'next/server';
import { createSession, loginWithPassword, SESSION_COOKIE } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { LAST_PORTAL_COOKIE, portalHrefFor } from '@/lib/boat-rental/portal-routing';
import type { BoatRole } from '@/lib/boat-rental/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// If the user has a stored "last portal" cookie AND still has the
// matching role, return that portal's URL. Otherwise null. Done with a
// direct role lookup (rather than full SessionUser hydration) because
// the new session cookie isn't on the request yet — we just minted it.
async function landingFromLastPortalCookie(
  userId: string,
  cookieValue: string | undefined
): Promise<string | null> {
  if (cookieValue !== 'admin' && cookieValue !== 'broker' && cookieValue !== 'owner') {
    return null;
  }
  const role = cookieValue as BoatRole;
  const sb = supabaseAdmin();
  if (role === 'admin') {
    // Admin can also be implicit via app-level role.
    const { data: u } = await sb.from('app_users').select('role').eq('id', userId).maybeSingle();
    if ((u as { role: string } | null)?.role === 'admin') return portalHrefFor('admin');
  }
  const { count } = await sb
    .from('boat_rental_user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('role', role);
  if ((count || 0) > 0) return portalHrefFor(role);
  return null;
}

async function handle(req: NextRequest) {
  let username = '';
  let password = '';
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({})) as {
      username?: string;
      password?: string;
    };
    username = body.username || '';
    password = body.password || '';
  } else {
    const form = await req.formData();
    username = String(form.get('username') || '');
    password = String(form.get('password') || '');
  }

  const result = await loginWithPassword(username, password);
  if (!result.ok) {
    const next = req.nextUrl.searchParams.get('next') || '/';
    const back = new URL(
      `/login?err=${encodeURIComponent(result.error)}&next=${encodeURIComponent(next)}`,
      req.url
    );
    return NextResponse.redirect(back, { status: 303 });
  }

  const { token, expiresAt } = await createSession(result.userId, {
    userAgent: req.headers.get('user-agent') || undefined,
    ip: req.headers.get('x-forwarded-for') || undefined,
  });

  // Resolve the redirect target. An explicit deep-link `next` always
  // wins (so login-then-deep-link still works). When `next` is the
  // default '/' we consult the boat-rental last-portal cookie so
  // multi-role users land back where they were.
  const nextParam = req.nextUrl.searchParams.get('next');
  let safeNext = '/';
  if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    safeNext = nextParam;
  }
  if (safeNext === '/') {
    const cookieLast = req.cookies.get(LAST_PORTAL_COOKIE)?.value;
    const fromCookie = await landingFromLastPortalCookie(result.userId, cookieLast);
    if (fromCookie) safeNext = fromCookie;
  }

  const res = NextResponse.redirect(new URL(safeNext, req.url), { status: 303 });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https'),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return res;
}

export async function POST(req: NextRequest) {
  return handle(req);
}
