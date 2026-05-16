import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @/lib/auth and the snapshot business-logic module before importing the
// route. The route is a thin POST wrapper: auth + is_admin + delegate.
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock('@/lib/personal/networth/snapshot', () => ({
  takeSnapshot: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { takeSnapshot } from '@/lib/personal/networth/snapshot';

beforeEach(() => {
  vi.clearAllMocks();
});

function req(): Request {
  return new Request('http://localhost/api/personal/networth/snapshot', {
    method: 'POST',
  });
}

describe('POST /api/personal/networth/snapshot', () => {
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

  it('returns 200 with snapshot id on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      username: 'admin',
      role: 'admin',
      allowed_domains: [],
      is_admin: true,
    });
    vi.mocked(takeSnapshot).mockResolvedValue({
      snapshotId: 'snap-1',
      netWorthEgp: 9000,
    } as never);
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.snapshotId).toBe('snap-1');
    expect(vi.mocked(takeSnapshot)).toHaveBeenCalledWith('u1', 'manual');
  });
});

// Use `req` so the import doesn't get tree-shaken if we add more cases later;
// snapshot POST takes no arguments today.
void req;
