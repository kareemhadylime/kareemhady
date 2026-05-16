import { describe, it, expect, vi } from 'vitest';
import { takeSnapshot, listSnapshotsForChart } from './snapshot';

// supabaseAdmin is mocked at module level; integration coverage comes from cron route tests
vi.mock('@/lib/supabase');

describe('takeSnapshot', () => {
  it('exports a function', () => {
    expect(typeof takeSnapshot).toBe('function');
  });
});

describe('listSnapshotsForChart', () => {
  it('exports a function', () => {
    expect(typeof listSnapshotsForChart).toBe('function');
  });
});
