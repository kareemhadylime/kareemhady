import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chainSequence } from '../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

const params = () => Promise.resolve({ id: 'pay-1' });
function req() {
  return new Request('http://localhost/x', { method: 'DELETE' });
}

describe('DELETE /api/personal/networth/payments/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await DELETE(req(), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await DELETE(req(), { params: params() })).status).toBe(403);
  });
  it('returns 404 when payment not found', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([{ data: null, error: null }]) as never,
    );
    expect((await DELETE(req(), { params: params() })).status).toBe(404);
  });
  it('returns 200 when payment exists with no schedule link', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([
        { data: { id: 'pay-1', loan_schedule_id: null }, error: null }, // read
        { data: null, error: null }, // delete
      ]) as never,
    );
    expect((await DELETE(req(), { params: params() })).status).toBe(200);
  });
  it('returns 200 when payment links to a schedule (also resets the schedule row)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([
        { data: { id: 'pay-1', loan_schedule_id: 'sch-1' }, error: null }, // read
        { data: null, error: null }, // schedule reset
        { data: null, error: null }, // delete
      ]) as never,
    );
    expect((await DELETE(req(), { params: params() })).status).toBe(200);
  });
});
