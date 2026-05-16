import type { AmortizationInput, ScheduleRow } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const newY = y + Math.floor((m - 1 + months) / 12);
  const newM = ((m - 1 + months) % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
