import type { AmortizationInput, EarlyPayoffResult, ScheduleRow } from './types';

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

export function earlyPayoffProjection(
  schedule: ScheduleRow[],
  paidInstallmentCount: number,
  extraMonthlyAmount: number,
  aprPct: number
): EarlyPayoffResult {
  const r = aprPct / 100 / 12;
  const remaining = schedule.slice(paidInstallmentCount);
  if (remaining.length === 0) {
    return { newPayoffDate: schedule[schedule.length - 1].dueDate, totalInterestSaved: 0, monthsSaved: 0 };
  }

  const baseRemainingBalance = paidInstallmentCount === 0
    ? schedule[0].principalPortion + schedule[0].remainingAfter
    : schedule[paidInstallmentCount - 1].remainingAfter;

  const baseMonthly = remaining[0].principalPortion + remaining[0].interestPortion;
  const newMonthly = baseMonthly + extraMonthlyAmount;
  const baseInterestRemaining = remaining.reduce((s, row) => s + row.interestPortion, 0);

  let balance = baseRemainingBalance;
  let months = 0;
  let interestPaid = 0;
  let lastDueDate = remaining[remaining.length - 1].dueDate;
  let currentDate = remaining[0].dueDate;

  while (balance > 0.01 && months < remaining.length + 600) {
    const interest = Math.round(balance * r * 100) / 100;
    const principalPart = Math.min(balance, Math.round((newMonthly - interest) * 100) / 100);
    balance = Math.round((balance - principalPart) * 100) / 100;
    interestPaid += interest;
    lastDueDate = currentDate;
    months++;
    currentDate = addMonths(currentDate, 1);
    if (principalPart <= 0) break;
  }

  return {
    newPayoffDate: lastDueDate,
    totalInterestSaved: Math.round((baseInterestRemaining - interestPaid) * 100) / 100,
    monthsSaved: remaining.length - months,
  };
}
