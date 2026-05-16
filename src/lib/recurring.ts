export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly';

/**
 * Compute the next run date for a recurring expense template.
 * - monthly: same day_of_period in next month
 * - quarterly: same day_of_period 3 months later
 * - yearly: same month_of_year + day_of_period in next year
 *
 * day_of_period must be 1-28 (we cap at 28 in the form to avoid Feb-end edge cases).
 * Returns YYYY-MM-DD string.
 */
export function computeNextRunDate(
  frequency: RecurringFrequency,
  dayOfPeriod: number,
  monthOfYear: number | null,
  fromDateStr: string
): string {
  if (dayOfPeriod < 1 || dayOfPeriod > 28) {
    throw new Error(`day_of_period must be 1-28, got ${dayOfPeriod}`);
  }
  // Issue 1: Validate fromDateStr format (YYYY-MM-DD)
  const parts = fromDateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`fromDateStr must be YYYY-MM-DD, got "${fromDateStr}"`);
  }
  const [y, m, d] = parts.map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || m < 1 || m > 12) {
    throw new Error(`Invalid date format: "${fromDateStr}"`);
  }
  let nextY = y;
  let nextM = m;
  if (frequency === 'monthly') {
    nextM = m + 1;
    if (nextM > 12) { nextM = 1; nextY = y + 1; }
  } else if (frequency === 'quarterly') {
    nextM = m + 3;
    while (nextM > 12) { nextM -= 12; nextY += 1; }
  } else if (frequency === 'yearly') {
    // Issue 2: Validate monthOfYear bounds before checking existence
    if (monthOfYear !== null && (monthOfYear < 1 || monthOfYear > 12)) {
      throw new Error(`monthOfYear must be 1-12, got ${monthOfYear}`);
    }
    if (!monthOfYear) throw new Error('monthOfYear required for yearly frequency');
    nextY = y + 1;
    nextM = monthOfYear;
  }
  return `${nextY}-${String(nextM).padStart(2, '0')}-${String(dayOfPeriod).padStart(2, '0')}`;
}
