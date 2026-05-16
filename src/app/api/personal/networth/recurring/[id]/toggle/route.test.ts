import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { adminUser, viewerUser, chainSequence } from '../../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

const params = () => Promise.resolve({ id: 'tpl-1' });
function req() {
  return new Request('http://localhost/x', { method: 'POST' });
}

describe('POST /api/personal/networth/recurring/[id]/toggle', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req(), { params: params() })).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await POST(req(), { params: params() })).status).toBe(403);
  });
  it('returns 404 when template not found', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([{ data: null, error: null }]) as never,
    );
    expect((await POST(req(), { params: params() })).status).toBe(404);
  });
  it('returns 200 and flips active=true → false', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([
        { data: { active: true }, error: null }, // initial fetch
        { data: null, error: null }, // update
      ]) as never,
    );
    const res = await POST(req(), { params: params() });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.active).toBe(false);
  });
  it('returns 200 and flips active=false → true', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(supabaseAdmin).mockReturnValue(
      chainSequence([
        { data: { active: false }, error: null },
        { data: null, error: null },
      ]) as never,
    );
    const res = await POST(req(), { params: params() });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.active).toBe(true);
  });
});
