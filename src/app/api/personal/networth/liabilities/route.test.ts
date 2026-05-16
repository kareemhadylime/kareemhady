import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/personal/networth/liability', () => ({
  createLiability: vi.fn(),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createLiability } from '@/lib/personal/networth/liability';
import { adminUser, viewerUser, chain } from '../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/liabilities', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET()).status).toBe(403);
  });
  it('returns 200 with liabilities array', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [{ id: 'l1', name: 'CIB visa' }], error: null }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.liabilities).toHaveLength(1);
  });
});

describe('POST /api/personal/networth/liabilities', () => {
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
  it('returns 400 on invalid body (missing required fields)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}))).status).toBe(400);
  });
  it('returns 200 with id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(createLiability).mockResolvedValue('liab-1');
    const res = await POST(
      req({
        name: 'CIB visa',
        kind: 'credit_card',
        currency: 'EGP',
        currentBalance: 5000,
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.id).toBe('liab-1');
  });
  it('returns 400 when createLiability throws', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(createLiability).mockRejectedValue(new Error('bad input'));
    const res = await POST(
      req({
        name: 'visa',
        kind: 'credit_card',
        currency: 'EGP',
        currentBalance: 100,
      }),
    );
    expect(res.status).toBe(400);
  });
});
