// Shared test helpers for the personal/networth API route tests.
// Each route test imports these to avoid duplicating fixtures and the
// supabase chain mock factory.

import { vi } from 'vitest';

export const adminUser = {
  id: 'u1',
  username: 'admin',
  role: 'admin' as const,
  allowed_domains: [] as never[],
  is_admin: true,
};

export const viewerUser = {
  id: 'u1',
  username: 'viewer',
  role: 'viewer' as const,
  allowed_domains: [] as never[],
  is_admin: false,
};

export type Returns = { data?: unknown; error?: unknown };

// Build a chain-mock supabase client. Every chain method returns `this` so
// callers can chain in any order. `single`/`maybeSingle` resolve to the
// provided shape; the chain is also awaitable directly (some routes do
// `await sb.from().select().eq()`) via a `.then` fallback.
export function chain(returns: Returns) {
  const c: Record<string, unknown> = {};
  const reflexive = [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'lte',
    'gte',
    'lt',
    'order',
    'limit',
    'in',
  ];
  for (const m of reflexive) c[m] = vi.fn(() => c);
  c.single = vi.fn().mockResolvedValue(returns);
  c.maybeSingle = vi.fn().mockResolvedValue(returns);
  c.then = (resolve: (v: Returns) => unknown) =>
    Promise.resolve(returns).then(resolve);
  return c;
}

// Build a chain that returns *different* shapes on successive `.maybeSingle()`
// or terminal awaits. Useful for routes that read-then-write (e.g. the
// recurring PATCH that fetches the row then updates it, or the payment
// DELETE that reads then deletes).
export function chainSequence(seq: Returns[]) {
  const c: Record<string, unknown> = {};
  const reflexive = [
    'from',
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'lte',
    'gte',
    'lt',
    'order',
    'limit',
    'in',
  ];
  for (const m of reflexive) c[m] = vi.fn(() => c);
  let i = 0;
  const next = () => seq[Math.min(i++, seq.length - 1)];
  c.single = vi.fn(() => Promise.resolve(next()));
  c.maybeSingle = vi.fn(() => Promise.resolve(next()));
  // For terminal awaits without single/maybeSingle (e.g. update().eq().eq()):
  c.then = (resolve: (v: Returns) => unknown) =>
    Promise.resolve(next()).then(resolve);
  return c;
}
