import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

function getReq(qs = '') {
  return new Request(`http://localhost/x${qs ? '?' + qs : ''}`, {
    method: 'GET',
  });
}

describe('GET /api/personal/networth/payments', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET(getReq())).status).toBe(403);
  });
  it('returns 200 with payments array (no filters)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 'p1', amount: 100 }], error: null }) as never,
    );
    const res = await GET(getReq());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.payments).toHaveLength(1);
  });
  it('returns 200 with filters applied', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [], error: null }) as never,
    );
    const res = await GET(
      getReq('from=2026-01-01&to=2026-05-01&category=rent&liabilityId=l1'),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/personal/networth/payments', () => {
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
  it('returns 400 on invalid body', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}))).status).toBe(400);
  });
  it('returns 200 with id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: { id: 'pay-1' }, error: null }) as never,
    );
    const res = await POST(
      req({
        occurredOn: '2026-05-16',
        amount: 500,
        currency: 'EGP',
        category: 'rent',
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.id).toBe('pay-1');
  });
});
