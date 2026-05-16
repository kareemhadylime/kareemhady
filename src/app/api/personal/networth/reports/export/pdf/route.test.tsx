import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/personal/networth/queries', () => ({
  getMonthlyReport: vi.fn(),
}));
// @react-pdf/renderer is a Node-side PDF engine that pulls in fontkit and other
// native-ish deps. We stub it out — the route's contract for this test is just
// "auth gates work and on success we return a 200 with a pdf content-type",
// not "the produced PDF is valid".
vi.mock('@react-pdf/renderer', () => {
  const passthroughComponent = (props: { children?: unknown }) => props.children;
  return {
    renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF-stub')),
    Document: passthroughComponent,
    Page: passthroughComponent,
    Text: passthroughComponent,
    View: passthroughComponent,
    StyleSheet: { create: (s: unknown) => s },
  };
});

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyReport } from '@/lib/personal/networth/queries';
import { adminUser, viewerUser } from '../../../__tests__/helpers';

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/personal/networth/reports/export/pdf', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req({}))).status).toBe(401);
  });
  it('returns 403 when not admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(viewerUser);
    expect((await POST(req({}))).status).toBe(403);
  });
  it('returns 400 on invalid body', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    expect((await POST(req({}))).status).toBe(400);
  });
  it('returns 200 with PDF content-type on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(adminUser);
    vi.mocked(getMonthlyReport).mockResolvedValue({
      monthLabel: '2026-05',
      totalEgp: 1000,
      deltaEgp: 100,
      deltaPct: 10,
      byCategory: [],
    } as never);
    const res = await POST(req({ year: 2026, month: 5 }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});
