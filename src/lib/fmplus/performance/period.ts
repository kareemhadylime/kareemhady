// src/lib/fmplus/performance/period.ts
import type { PeriodChip, PeriodRange } from './types';

export interface ResolveInput {
  chip: PeriodChip;
  from?: string;
  to?: string;
}

function fmt(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function shiftMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function monthLabel(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export function resolvePeriod(input: ResolveInput, now: Date = new Date()): PeriodRange {
  switch (input.chip) {
    case 'this-month': {
      const from = firstOfMonth(now);
      return { chip: 'this-month', from: fmt(from), to: fmt(now), label: `${monthLabel(now)} (running)` };
    }
    case 'last-month': {
      const lm = shiftMonths(now, -1);
      return { chip: 'last-month', from: fmt(firstOfMonth(lm)), to: fmt(lastOfMonth(lm)), label: monthLabel(lm) };
    }
    case 'last-3': {
      const start = firstOfMonth(shiftMonths(now, -3));
      const end = lastOfMonth(shiftMonths(now, -1));
      return { chip: 'last-3', from: fmt(start), to: fmt(end), label: `${monthLabel(start)} – ${monthLabel(end)}` };
    }
    case 'qtd': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      return { chip: 'qtd', from: fmt(from), to: fmt(now), label: `Q${q + 1} ${now.getFullYear()} QTD` };
    }
    case 'ytd': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { chip: 'ytd', from: fmt(from), to: fmt(now), label: `${now.getFullYear()} YTD` };
    }
    case 'custom': {
      if (!input.from || !input.to) throw new Error('custom period requires from + to');
      return { chip: 'custom', from: input.from, to: input.to, label: `${input.from} → ${input.to}` };
    }
  }
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function resolvePriorPeriod(p: PeriodRange): PeriodRange {
  const from = parseLocal(p.from);
  const to = parseLocal(p.to);
  const fromIsMonthStart = from.getDate() === 1;
  const toIsMonthEnd = lastOfMonth(to).getDate() === to.getDate();
  if (fromIsMonthStart && toIsMonthEnd) {
    // Calendar-month aligned: shift back by the same number of months.
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    // Build from month components to avoid day-overflow (e.g. Feb 31 → Mar 3).
    const priorFrom = new Date(from.getFullYear(), from.getMonth() - months, 1);
    const priorToMonth = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const priorTo = lastOfMonth(priorToMonth);
    return { chip: p.chip, from: fmt(priorFrom), to: fmt(priorTo), label: `Prior ${p.label}` };
  }
  // Arbitrary range: shift back by the same number of days.
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const priorTo = new Date(from);
  priorTo.setDate(priorTo.getDate() - 1);
  const priorFrom = new Date(priorTo);
  priorFrom.setDate(priorFrom.getDate() - days + 1);
  return { chip: p.chip, from: fmt(priorFrom), to: fmt(priorTo), label: `Prior ${p.label}` };
}
