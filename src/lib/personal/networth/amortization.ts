import type { AmortizationInput, ScheduleRow } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear = y + Math.floor((m - 1 + months) / 12);
  const targetMonth = ((m - 1 + months) % 12) + 1; // 1-indexed
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate(); // day 0 = last day of prev month
  const clampedDay = Math.min(d, daysInMonth);
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function generateSchedule(input: AmortizationInput): ScheduleRow[] {
  const { principal, aprPct, termMonths, startDate, monthlyOverride } = input;
  if (principal <= 0) throw new Error('principal must be > 0');
  if (termMonths < 1) throw new Error('termMonths must be >= 1');
  if (aprPct < 0) throw new Error('aprPct must be >= 0');

  const r = aprPct / 100 / 12;
  const monthly = monthlyOverride ?? (
    r === 0
      ? principal / termMonths
      : principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
  );

  if (monthlyOverride !== undefined) {
    const firstInterest = round2(principal * r);
    if (monthlyOverride <= firstInterest) {
      throw new Error(
        `monthlyOverride (${monthlyOverride}) must exceed first month's interest (${firstInterest})`
      );
    }
  }

  const rows: ScheduleRow[] = [];
  let remaining = principal;
  for (let i = 1; i <= termMonths; i++) {
    const interest = round2(remaining * r);
    let principalPart = round2(monthly - interest);
    let newRemaining = round2(remaining - principalPart);
    if (i === termMonths) {
      // Absorb rounding drift: last row pays off exactly
      principalPart = round2(remaining);
      newRemaining = 0;
    }
    rows.push({
      installmentNo: i,
      dueDate: addMonths(startDate, i),
      principalPortion: principalPart,
      interestPortion: interest,
      remainingAfter: newRemaining,
    });
    remaining = newRemaining;
  }
  return rows;
}
