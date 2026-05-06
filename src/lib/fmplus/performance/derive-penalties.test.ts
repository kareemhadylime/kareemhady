import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: [
        { service_code: 'hk',  penalty_type: 'shortage', amount: 1500, lines: 1 },
        { service_code: 'mep', penalty_type: 'kpi',      amount:  800, lines: 2 },
      ],
      error: null,
    }),
  }),
}));

const { penaltiesBlock } = await import('./derive-penalties');

describe('penaltiesBlock', () => {
  test('rolls up totals + labels services', async () => {
    const r = await penaltiesBlock({ project_id: 33, from: '2026-03-01', to: '2026-03-31' });
    expect(r).not.toBeNull();
    expect(r!.total_amount).toBe(2300);
    expect(r!.total_lines).toBe(3);
    expect(r!.rows[0].service_label).toBe('Housekeeping');
    expect(r!.rows[1].penalty_type).toBe('kpi');
  });
});
