import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/personal/networth/payment', () => ({
  recordPaymentForSchedule: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { recordPaymentForSchedule } from '@/lib/personal/networth/payment';
import { adminUser, viewerUser } from '../../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

const params = () => Promise.resolve({ id: 'liab-1' });
function req(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/personal/networth/liabilities/[id]/mark-paid', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req({}), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await POST(req({}), { params: params() })).status).toBe(403);
  });
  it('returns 400 on invalid body', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}), { params: params() })).status).toBe(400);
  });
  // Valid v4 UUID — zod's .uuid() expects a real UUID, not just hex.
  const VALID_UUID = '12345678-1234-4234-8234-123456789abc';
  it('returns 200 with paymentId on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(recordPaymentForSchedule).mockResolvedValue('pay-1');
    const res = await POST(
      req({
        scheduleId: VALID_UUID,
        occurredOn: '2026-05-16',
        amount: 500,
      }),
      { params: params() },
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.paymentId).toBe('pay-1');
  });
  it('returns 400 when payment service throws', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(recordPaymentForSchedule).mockRejectedValue(
      new Error('already paid'),
    );
    const res = await POST(
      req({
        scheduleId: VALID_UUID,
        occurredOn: '2026-05-16',
        amount: 500,
      }),
      { params: params() },
    );
    expect(res.status).toBe(400);
  });
});
