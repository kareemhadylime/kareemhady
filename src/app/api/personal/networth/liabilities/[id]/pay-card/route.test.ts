import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/personal/networth/payment', () => ({
  recordCardPayment: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { recordCardPayment } from '@/lib/personal/networth/payment';
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

describe('POST /api/personal/networth/liabilities/[id]/pay-card', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req({}), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await POST(req({}), { params: params() })).status).toBe(403);
  });
  it('returns 400 on invalid body (unknown preset)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect(
      (await POST(req({ preset: 'half' }), { params: params() })).status,
    ).toBe(400);
  });
  it('returns 400 when preset=custom and customAmount missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect(
      (await POST(req({ preset: 'custom' }), { params: params() })).status,
    ).toBe(400);
  });
  it('returns 200 on minimum preset and translates to internal "min"', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(recordCardPayment).mockResolvedValue('pay-1');
    const res = await POST(req({ preset: 'minimum' }), { params: params() });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.paymentId).toBe('pay-1');
    // Verify the public 'minimum' → internal 'min' translation per the route's comment.
    expect(vi.mocked(recordCardPayment)).toHaveBeenCalledWith(
      'liab-1',
      'u1',
      'min',
      undefined,
    );
  });
  it('returns 400 when payment service throws', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(recordCardPayment).mockRejectedValue(new Error('no balance'));
    const res = await POST(req({ preset: 'full' }), { params: params() });
    expect(res.status).toBe(400);
  });
});
