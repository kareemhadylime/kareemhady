import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthUrl } from '@/lib/gmail';

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex');
  const url = getAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
