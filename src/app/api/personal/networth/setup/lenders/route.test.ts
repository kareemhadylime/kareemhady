import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET, POST, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/setup/lenders', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET()).status).toBe(403);
  });
  it('returns 200 with lenders array', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 'l1', name: 'CIB' }], error: null }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.lenders).toHaveLength(1);
  });
});

describe('POST /api/personal/networth/setup/lenders', () => {
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
  it('returns 200 with id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: { id: 'lend-1' }, error: null }) as never,
    );
    const res = await POST(req({ name: 'CIB', kind: 'bank' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.id).toBe('lend-1');
  });
});

describe('DELETE /api/personal/networth/setup/lenders', () => {
  function req(id?: string) {
    const url = id ? `http://localhost/x?id=${id}` : 'http://localhost/x';
    return new Request(url, { method: 'DELETE' });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await DELETE(req('id-1'))).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await DELETE(req('id-1'))).status).toBe(403);
  });
  it('returns 400 when id missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await DELETE(req())).status).toBe(400);
  });
  it('returns 200 on successful delete', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    expect((await DELETE(req('lend-1'))).status).toBe(200);
  });
});
