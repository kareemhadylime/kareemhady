import { describe, it, expect } from 'vitest';
import {
  quarterEndsBefore,
  dueDateFor,
  nextSnapshotDue,
} from './cadence';

describe('quarterEndsBefore', () => {
  it('returns all quarter-ends on/before the given date (descending)', () => {
    const out = quarterEndsBefore('2026-05-12');
    expect(out.slice(0, 3)).toEqual(['2026-03-31', '2025-12-31', '2025-09-30']);
  });
  it('includes the date itself when it IS a quarter-end', () => {
    const out = quarterEndsBefore('2026-03-31');
    expect(out[0]).toBe('2026-03-31');
  });
});

describe('dueDateFor', () => {
  it('returns period_end + 6 calendar months', () => {
    expect(dueDateFor('2025-12-31')).toBe('2026-06-30');
    expect(dueDateFor('2026-03-31')).toBe('2026-09-30');
    expect(dueDateFor('2026-06-30')).toBe('2026-12-31');
    expect(dueDateFor('2026-08-31')).toBe('2027-02-28'); // non-quarter input still works
  });
});

describe('nextSnapshotDue', () => {
  it('returns null if every recent quarter already has a frozen snapshot', () => {
    const frozen = new Set([
      '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31',
    ]);
    const out = nextSnapshotDue('2026-05-12', frozen);
    expect(out).toBeNull();
  });

  it('returns the most recent unfrozen quarter when overdue', () => {
    const frozen = new Set<string>();
    const out = nextSnapshotDue('2026-09-15', frozen);
    // Today is 2026-09-15; Q1-2026 (period_end=2026-03-31) + 6mo = 2026-09-30,
    // so not yet overdue. But Q4-2025 (2025-12-31) + 6mo = 2026-06-30 IS overdue.
    expect(out).toEqual({ period_end: '2025-12-31', is_overdue: true, due_by: '2026-06-30' });
  });

  it('returns first not-yet-overdue quarter when no overdue ones exist', () => {
    const frozen = new Set(['2025-12-31', '2025-09-30', '2025-06-30']);
    const out = nextSnapshotDue('2026-05-12', frozen);
    expect(out).toEqual({
      period_end: '2026-03-31',
      is_overdue: false,
      due_by: '2026-09-30',
    });
  });
});
