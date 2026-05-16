import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/recurring', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET()).status).toBe(403);
  });
  it('returns 200 with templates array', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 't1', name: 'Rent' }], error: null }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.templates).toHaveLength(1);
  });
});

describe('POST /api/personal/networth/recurring', () => {
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
  it('returns 400 on invalid body (missing fields)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}))).status).toBe(400);
  });
  it('returns 400 when frequency=yearly without monthOfYear', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    const res = await POST(
      req({
        name: 'Insurance',
        category: 'insurance',
        amount: 100,
        currency: 'EGP',
        frequency: 'yearly',
        dayOfPeriod: 1,
      }),
    );
    expect(res.status).toBe(400);
  });
  it('returns 200 with id on successful monthly create', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: { id: 'tpl-1' }, error: null }) as never,
    );
    const res = await POST(
      req({
        name: 'Rent',
        category: 'rent',
        amount: 5000,
        currency: 'EGP',
        frequency: 'monthly',
        dayOfPeriod: 1,
        startFrom: '2026-01-15',
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.id).toBe('tpl-1');
  });
});
