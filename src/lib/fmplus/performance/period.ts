// src/lib/fmplus/performance/period.ts
import type { PeriodChip, PeriodRange } from './types';

export interface ResolveInput {
  chip: PeriodChip;
  from?: string;
  to?: string;
  offset?: number;       // for prev-month
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
  // Backward-compat: old chip ids → new ids
  const legacy = input.chip as string;
  if (legacy === 'last-month') input = { ...input, chip: 'prev-month' };
  if (legacy === 'this-month') input = { ...input, chip: 'prev-month' };  // partial-month UX dropped; redirect to prev-month
  if (legacy === 'qtd') input = { ...input, chip: 'last-quarter' };       // partial-quarter UX dropped; redirect to last-quarter

  switch (input.chip) {
    case 'prev-month': {
      const offset = typeof input.offset === 'number' && input.offset > 0 ? Math.floor(input.offset) : 1;
      const target = shiftMonths(now, -offset);
      return {
        chip: 'prev-month',
        from: fmt(firstOfMonth(target)),
        to: fmt(lastOfMonth(target)),
        label: monthLabel(target),
        offset,
      };
    }
    case 'last-3': {
      const start = firstOfMonth(shiftMonths(now, -3));
      const end = lastOfMonth(shiftMonths(now, -1));
      return { chip: 'last-3', from: fmt(start), to: fmt(end), label: `${monthLabel(start)} – ${monthLabel(end)}` };
    }
    case 'last-quarter': {
      const curQ = Math.floor(now.getMonth() / 3);                  // 0..3
      const lastQ = curQ === 0 ? 3 : curQ - 1;                      // 0..3
      const lastQYear = curQ === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const start = new Date(lastQYear, lastQ * 3, 1);
      const end = lastOfMonth(new Date(lastQYear, lastQ * 3 + 2, 1));
      return { chip: 'last-quarter', from: fmt(start), to: fmt(end), label: `Q${lastQ + 1} ${lastQYear}` };
    }
    case 'ytd': {
      // Jan 1 of current year → end of LAST COMPLETED month (not today, since
      // the current month is partial).
      const from = new Date(now.getFullYear(), 0, 1);
      const lastCompleted = shiftMonths(now, -1);
      const to = lastOfMonth(lastCompleted);
      if (to.getTime() < from.getTime()) {
        // January: no completed months in this year yet
        return { chip: 'ytd', from: fmt(from), to: fmt(from), label: `${now.getFullYear()} YTD (no completed months)` };
      }
      return { chip: 'ytd', from: fmt(from), to: fmt(to), label: `${now.getFullYear()} YTD` };
    }
    case 'last-year': {
      const ly = now.getFullYear() - 1;
      return {
        chip: 'last-year',
        from: fmt(new Date(ly, 0, 1)),
        to: fmt(new Date(ly, 11, 31)),
        label: `${ly}`,
      };
    }
    case 'custom': {
      // Defensive: if user clicked Custom without entering dates, fall back to prev-month
      // instead of throwing (the throw was surfacing as a generic server error in production).
      if (!input.from || !input.to) {
        return resolvePeriod({ chip: 'prev-month' }, now);
      }
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
