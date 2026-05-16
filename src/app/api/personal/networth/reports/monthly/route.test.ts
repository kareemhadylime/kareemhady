import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/personal/networth/queries', () => ({
  getMonthlyReport: vi.fn(),
}));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';
import { adminUser, viewerUser } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

function getReq(qs = '') {
  return new Request(`http://localhost/x${qs ? '?' + qs : ''}`, {
    method: 'GET',
  });
}

describe('GET /api/personal/networth/reports/monthly', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await GET(getReq())).status).toBe(403);
  });
  it('returns 400 when year/month are malformed (zod rejects)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    // year out of range — zod coerces but min/max bounds reject.
    const res = await GET(getReq('year=1900&month=13'));
    expect(res.status).toBe(400);
  });
  it('returns 200 with report on valid query', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(getMonthlyReport).mockResolvedValue({
      monthLabel: '2026-05',
      totalEgp: 1000,
      deltaEgp: 100,
      deltaPct: 10,
      byCategory: [],
    } as never);
    const res = await GET(getReq('year=2026&month=5'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.report.totalEgp).toBe(1000);
  });
  it('falls back to Cairo current month when query params omitted', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(getMonthlyReport).mockResolvedValue({
      monthLabel: '2026-05',
      totalEgp: 0,
      deltaEgp: 0,
      deltaPct: null,
      byCategory: [],
    } as never);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(vi.mocked(getMonthlyReport)).toHaveBeenCalledTimes(1);
  });
});
