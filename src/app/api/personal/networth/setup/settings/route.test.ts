import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET, PUT } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/personal/networth/setup/settings', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET()).status).toBe(403);
  });
  it('returns 200 with settings shape', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({
        data: { charity_goal_egp_year: 100000, default_currency: 'EGP' },
        error: null,
      }) as never,
    );
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.settings.default_currency).toBe('EGP');
  });
});

describe('PUT /api/personal/networth/setup/settings', () => {
  function req(body: unknown) {
    return new Request('http://localhost/x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await PUT(req({}))).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await PUT(req({}))).status).toBe(403);
  });
  it('returns 200 on successful upsert', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: null, error: null }) as never,
    );
    const res = await PUT(
      req({ charityGoalEgpYear: 200000, defaultCurrency: 'EGP', monthlySnapshotDay: 1 }),
    );
    expect(res.status).toBe(200);
  });
});
