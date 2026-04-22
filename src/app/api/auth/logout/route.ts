import { NextRequest, NextResponse } from 'next/server';
import { destroySession, SESSION_COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.redirect(new URL('/login', req.url), { status: 303 });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return res;
}
export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
