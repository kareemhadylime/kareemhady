import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));
// Empty due-templates list keeps the per-template loop a no-op so we exercise
// just the auth + happy-path branches. Chain shape mirrors the route's query:
// from().select().eq().eq().lte().
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            lte: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/personal/networth/payment', () => ({
  recordPaymentForRecurringTemplate: vi.fn().mockResolvedValue('pay-1'),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

beforeEach(() => vi.clearAllMocks());

describe('POST /api/personal/networth/recurring/run-now', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      username: 'u1',
      role: 'viewer',
      allowed_domains: [],
      is_admin: false,
    });
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it('returns 200 with zero processed when no templates due', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      allowed_domains: [],
      is_admin: true,
    });
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(0);
  });
});
