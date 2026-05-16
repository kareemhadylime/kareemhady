import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: vi.fn(),
}));

import { GET, POST, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const admin = {
  id: 'u1',
  username: 'admin',
  role: 'admin' as const,
  allowed_domains: [] as never[],
  is_admin: true,
};
const viewer = {
  id: 'u1',
  username: 'u',
  role: 'viewer' as const,
  allowed_domains: [] as never[],
  is_admin: false,
};

// Supabase chain mock — every chain method returns `this` so consumers can call
// any sequence. `single`/`maybeSingle` resolve to the configured shape; the
// chain is also `then`-able for queries that await the chain directly
// (e.g. select().order()).
type Returns = { data?: unknown; error?: unknown };
function chain(returns: Returns) {
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

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/setup/fx', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewer);
    const res = await GET();
    expect(res.status).toBe(403);
  });
  it('returns 200 with rates on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 'r1', currency_code: 'USD' }], error: null }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rates).toHaveLength(1);
  });
});

describe('POST /api/personal/networth/setup/fx', () => {
  function req(body: unknown) {
    return new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewer);
    const res = await POST(req({}));
    expect(res.status).toBe(403);
  });
  it('returns 200 with id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: { id: 'fx-1' }, error: null }) as never,
    );
    const res = await POST(
      req({
        currencyCode: 'USD',
        rateToEgp: 50,
        asOfDate: '2026-05-16',
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.id).toBe('fx-1');
  });
});

describe('DELETE /api/personal/networth/setup/fx', () => {
  function req(id?: string) {
    const url = id
      ? `http://localhost/x?id=${id}`
      : 'http://localhost/x';
    return new Request(url, { method: 'DELETE' });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await DELETE(req('id-1'));
    expect(res.status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewer);
    const res = await DELETE(req('id-1'));
    expect(res.status).toBe(403);
  });
  it('returns 400 when id missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    const res = await DELETE(req());
    expect(res.status).toBe(400);
  });
  it('returns 200 on successful delete', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    const res = await DELETE(req('fx-1'));
    expect(res.status).toBe(200);
  });
});
