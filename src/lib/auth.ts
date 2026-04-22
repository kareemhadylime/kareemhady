import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabase';
import type { Domain } from './rules/presets';

// Simple session-cookie auth. Passwords stored as scrypt hashes in
// app_users.password_hash. Sessions live in app_sessions with an opaque
// random token as the cookie value. No JWT — server-side lookup on every
// request (small tenant, Supabase trip is fast).

export const SESSION_COOKIE = 'lime_session';
const SESSION_DAYS = 30;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

// ---- Password hashing ----

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  // Legacy bcrypt hashes might exist — accept only our scrypt format here.
  if (!stored || !stored.startsWith('scrypt$')) return false;
  try {
    const [, nStr, rStr, pStr, saltB64, keyB64] = stored.split('$');
    const N = parseInt(nStr, 10);
    const r = parseInt(rStr, 10);
    const p = parseInt(pStr, 10);
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---- Session management ----

export type SessionUser = {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  allowed_domains: Domain[];  // empty = all (admin implies all)
  is_admin: boolean;
};

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400e3);
  const sb = supabaseAdmin();
  await sb.from('app_sessions').insert({
    token,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    user_agent: meta.userAgent || null,
    ip: meta.ip || null,
  });
  await sb
    .from('app_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  const sb = supabaseAdmin();
  await sb.from('app_sessions').delete().eq('token', token);
}

// Server-side current-user lookup. Reads the session cookie, joins through
// app_sessions + app_users + app_user_domain_roles.
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const sb = supabaseAdmin();
  const { data: session } = await sb
    .from('app_sessions')
    .select('user_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!session) return null;
  const s = session as { user_id: string; expires_at: string };
  if (new Date(s.expires_at).getTime() < Date.now()) {
    // Expired — clean up and deny.
    await sb.from('app_sessions').delete().eq('token', token);
    return null;
  }
  // Touch last_seen so we can reap idle sessions later.
  await sb
    .from('app_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token', token);

  const { data: user } = await sb
    .from('app_users')
    .select('id, username, role')
    .eq('id', s.user_id)
    .maybeSingle();
  if (!user) return null;
  const u = user as { id: string; username: string; role: string };

  const isAdmin = (u.role || '').toLowerCase() === 'admin';
  let allowed: Domain[] = [];
  if (!isAdmin) {
    const { data: dr } = await sb
      .from('app_user_domain_roles')
      .select('domain')
      .eq('user_id', u.id);
    allowed = ((dr as Array<{ domain: string }> | null) || [])
      .map(r => r.domain)
      .filter((d): d is Domain =>
        ['personal', 'kika', 'lime', 'fmplus', 'voltauto', 'beithady'].includes(d)
      );
  }

  return {
    id: u.id,
    username: u.username,
    role: (u.role as SessionUser['role']) || 'viewer',
    allowed_domains: allowed,
    is_admin: isAdmin,
  };
}

export function canAccessDomain(user: SessionUser | null, domain: Domain): boolean {
  if (!user) return false;
  if (user.is_admin) return true;
  return user.allowed_domains.includes(domain);
}

// ---- Login helper (used by the /api/auth/login route) ----

export async function loginWithPassword(
  username: string,
  password: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('app_users')
    .select('id, password_hash')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return { ok: false, error: 'invalid_credentials' };
  const row = data as { id: string; password_hash: string };
  if (!verifyPassword(password, row.password_hash)) {
    return { ok: false, error: 'invalid_credentials' };
  }
  return { ok: true, userId: row.id };
}
