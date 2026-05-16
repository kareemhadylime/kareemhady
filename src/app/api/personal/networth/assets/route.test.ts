import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/assets', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET()).status).toBe(403);
  });
  it('returns 200 with assets array', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 'a1', name: 'CIB cash' }], error: null }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.assets).toHaveLength(1);
  });
});

describe('POST /api/personal/networth/assets', () => {
  function req(body: unknown) {
    return new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req({}))).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await POST(req({}))).status).toBe(403);
  });
  it('returns 400 on invalid body (zod rejects empty)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}))).status).toBe(400);
  });
  it('returns 200 with id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: { id: 'asset-1' }, error: null }) as never,
    );
    const res = await POST(
      req({
        name: 'CIB cash',
        kind: 'cash',
        currency: 'EGP',
        balance: 1000,
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.id).toBe('asset-1');
  });
});
