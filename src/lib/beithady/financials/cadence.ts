// Pure date math for snapshot cadence. NO database access — pure functions
// so this is trivially unit-testable.

const QUARTER_MONTHS = [3, 6, 9, 12]; // March, June, September, December

function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC. We treat all dates as date-only (no TZ).
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // monthIdx0 = 0..11. Trick: day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

/** Returns quarter-end dates ≤ asOf (descending), bounded by 5 years back. */
export function quarterEndsBefore(asOf: string): string[] {
  const cutoff = new Date(asOf + 'T00:00:00Z');
  const out: string[] = [];
  const startYear = cutoff.getUTCFullYear() + 1;
  for (let y = startYear; y >= startYear - 5; y--) {
    for (let i = QUARTER_MONTHS.length - 1; i >= 0; i--) {
      const m = QUARTER_MONTHS[i];
      const d = new Date(Date.UTC(y, m - 1, lastDayOfMonth(y, m - 1)));
      if (d.getTime() <= cutoff.getTime()) out.push(isoDate(d));
    }
  }
  return out;
}

/** Returns period_end + 6 calendar months (clamped to last day of month).
 *  If the source date falls on the last day of its month, the result
 *  is the last day of the target month (end-of-month semantic). */
export function dueDateFor(periodEnd: string): string {
  const d = new Date(periodEnd + 'T00:00:00Z');
  const year = d.getUTCFullYear();
  const monthIdx0 = d.getUTCMonth(); // 0..11
  const targetYear = year + Math.floor((monthIdx0 + 6) / 12);
  const targetMonthIdx0 = (monthIdx0 + 6) % 12;
  const sourceDay = d.getUTCDate();
  const sourceLastDay = lastDayOfMonth(year, monthIdx0);
  const targetLastDay = lastDayOfMonth(targetYear, targetMonthIdx0);
  // End-of-month dates stay end-of-month; otherwise clamp to target month's length.
  const day = sourceDay === sourceLastDay ? targetLastDay : Math.min(sourceDay, targetLastDay);
  return isoDate(new Date(Date.UTC(targetYear, targetMonthIdx0, day)));
}

export type NextDueResult = {
  period_end: string;
  is_overdue: boolean;
  due_by: string;
};

/**
 * Returns the most actionable unfrozen snapshot quarter-end:
 *
 * - If the most recent consecutive chain of frozen quarters is ≥ 4 (i.e. a
 *   full year's worth of snapshots exist), the system is considered current
 *   → returns null.
 * - If there is NO frozen baseline at all, returns the most recently ended
 *   quarter that is overdue (due_by < asOf). Falls back to the most recent
 *   upcoming quarter if nothing is overdue yet.
 * - If a frozen baseline exists but the chain is < 4, returns the quarter
 *   immediately following the tip of the chain (the next gap to fill),
 *   marking it overdue or upcoming accordingly.
 */
export function nextSnapshotDue(
  asOf: string,
  frozenPeriodEnds: Set<string>,
): NextDueResult | null {
  const allQuarters = quarterEndsBefore(asOf); // descending: newest first
  const todayMs = new Date(asOf + 'T00:00:00Z').getTime();

  // Find the most recent consecutive chain of frozen quarters.
  // Walk descending: skip unfrozen until we hit the first frozen, then count
  // consecutive frozen quarters going backwards in time.
  let mostRecentFrozenIdx = -1;
  let chainLength = 0;

  for (let i = 0; i < allQuarters.length; i++) {
    const q = allQuarters[i];
    if (mostRecentFrozenIdx === -1) {
      if (frozenPeriodEnds.has(q)) {
        mostRecentFrozenIdx = i;
        chainLength = 1;
      }
      // else: still looking for the first frozen quarter, keep going
    } else {
      if (frozenPeriodEnds.has(q)) {
        chainLength++;
      } else {
        break; // gap found — stop counting
      }
    }
  }

  // A consecutive chain of 4+ quarters (≥ 1 year) means nothing needs action.
  if (chainLength >= 4) return null;

  if (mostRecentFrozenIdx === -1) {
    // No frozen snapshots at all — surface the most recently ended overdue quarter.
    for (const p of allQuarters) {
      const due_by = dueDateFor(p);
      const dueMs = new Date(due_by + 'T00:00:00Z').getTime();
      if (dueMs <= todayMs) {
        return { period_end: p, is_overdue: true, due_by };
      }
    }
    // Nothing overdue yet — return the most recent upcoming quarter.
    if (allQuarters.length > 0) {
      const p = allQuarters[0];
      const due_by = dueDateFor(p);
      return { period_end: p, is_overdue: false, due_by };
    }
    return null;
  }

  // A frozen baseline exists but the chain is < 4.
  // Surface the quarter immediately after (newer than) the tip of the chain
  // — that is allQuarters[mostRecentFrozenIdx - 1], one step newer in time.
  if (mostRecentFrozenIdx > 0) {
    const p = allQuarters[mostRecentFrozenIdx - 1];
    const due_by = dueDateFor(p);
    const dueMs = new Date(due_by + 'T00:00:00Z').getTime();
    return { period_end: p, is_overdue: dueMs <= todayMs, due_by };
  }

  // The most recently frozen quarter is already at index 0 (the newest possible).
  // Nothing to surface.
  return null;
}
