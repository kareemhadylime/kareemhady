import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chain } from '../../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

function getReq(qs = '') {
  return new Request(`http://localhost/x${qs ? '?' + qs : ''}`, {
    method: 'GET',
  });
}

describe('GET /api/personal/networth/payments/export/csv', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
  it('returns 200 CSV with header and rows', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({
        data: [
          {
            occurred_on: '2026-05-16',
            amount: 100,
            currency: 'EGP',
            category: 'rent',
            notes: 'May',
            personal_networth_liabilities: null,
          },
        ],
        error: null,
      }) as never,
    );
    const res = await GET(getReq('from=2026-01-01&to=2026-05-31'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('date,amount,currency,category,liability,notes');
    expect(text).toContain('rent');
  });
  it('returns header-only CSV when zero rows', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chain({ data: [], error: null }) as never,
    );
    const res = await GET(getReq());
    const text = await res.text();
    expect(text.startsWith('date,amount,currency,category,liability,notes')).toBe(
      true,
    );
  });
});
