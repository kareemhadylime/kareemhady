import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { PATCH, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain, chainSequence } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

const params = () => Promise.resolve({ id: 'tpl-1' });

describe('PATCH /api/personal/networth/recurring/[id]', () => {
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
  it('returns 400 on invalid body (negative amount)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect(
      (await PATCH(req({ amount: -1 }), { params: params() })).status,
    ).toBe(400);
  });
  it('returns 200 on simple update (no cadence change, no DB read)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    const res = await PATCH(
      req({ name: 'Renamed', notes: 'updated' }),
      { params: params() },
    );
    expect(res.status).toBe(200);
  });
  it('returns 200 on cadence update (reads row then updates)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    // First call returns the existing row; subsequent calls return null/no-error.
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([
        { data: { frequency: 'monthly', day_of_period: 1, month_of_year: null }, error: null },
        { data: null, error: null },
      ]) as never,
    );
    const res = await PATCH(
      req({ frequency: 'monthly', dayOfPeriod: 15 }),
      { params: params() },
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/personal/networth/recurring/[id]', () => {
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
