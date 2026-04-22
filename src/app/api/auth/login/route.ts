import { NextRequest, NextResponse } from 'next/server';
import { createSession, loginWithPassword, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

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

  const nextPath = req.nextUrl.searchParams.get('next') || '/';
  const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/';
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
