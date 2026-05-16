import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { PATCH, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

const params = () => Promise.resolve({ id: 'liab-1' });

describe('PATCH /api/personal/networth/liabilities/[id]', () => {
  function req(body: unknown) {
    return new Request('http://localhost/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await PATCH(req({}), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await PATCH(req({}), { params: params() })).status).toBe(403);
  });
  it('returns 400 on invalid body (negative payment day)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect(
      (await PATCH(req({ statement_day: 100 }), { params: params() })).status,
    ).toBe(400);
  });
  it('returns 200 on successful update', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    const res = await PATCH(
      req({ notes: 'updated', monthly_payment: 1500 }),
      { params: params() },
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/personal/networth/liabilities/[id]', () => {
  function req() {
    return new Request('http://localhost/x', { method: 'DELETE' });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await DELETE(req(), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await DELETE(req(), { params: params() })).status).toBe(403);
  });
  it('returns 200 on successful soft-delete', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    expect((await DELETE(req(), { params: params() })).status).toBe(200);
  });
});
