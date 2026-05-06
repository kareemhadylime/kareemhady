// src/lib/fmplus/period-series.ts
import type { Granularity, Period } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

function monthLabel(yy: number, mm: number): string {
  return new Date(Date.UTC(yy, mm, 1)).toLocaleDateString('en-US', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function lastDayOfMonth(yy: number, mm: number): string {
  const d = new Date(Date.UTC(yy, mm + 1, 0));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function makeMonth(yy: number, mm: number): Period {
  return {
    key: `m:${yy}-${pad(mm + 1)}`,
    label: monthLabel(yy, mm),
    fromDate: `${yy}-${pad(mm + 1)}-01`,
    toDate: lastDayOfMonth(yy, mm),
  };
}

function makeQuarter(yy: number, q: number): Period {
  const startMonth = (q - 1) * 3;
  return {
    key: `q:${yy}-${q}`,
    label: `Q${q} ${yy}`,
    fromDate: `${yy}-${pad(startMonth + 1)}-01`,
    toDate: lastDayOfMonth(yy, startMonth + 2),
  };
}

function makeYear(yy: number): Period {
  return { key: `y:${yy}`, label: `${yy}`, fromDate: `${yy}-01-01`, toDate: `${yy}-12-31` };
}

function parseAsofMonthly(asof: string, now: Date): { yy: number; mm: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(asof);
  if (m) {
    const yy = Number(m[1]);
    const mm = Number(m[2]) - 1;
    if (mm >= 0 && mm <= 11) return { yy, mm };
  }
  return { yy: now.getUTCFullYear(), mm: now.getUTCMonth() };
}

function parseAsofQuarterly(asof: string, now: Date): { yy: number; q: number } {
  const m = /^(\d{4})-Q([1-4])$/.exec(asof);
  if (m) return { yy: Number(m[1]), q: Number(m[2]) };
  return { yy: now.getUTCFullYear(), q: Math.floor(now.getUTCMonth() / 3) + 1 };
}

function parseAsofYearly(asof: string, now: Date): { yy: number } {
  const m = /^(\d{4})$/.exec(asof);
  if (m) return { yy: Number(m[1]) };
  return { yy: now.getUTCFullYear() };
}

export function resolvePeriodSeries(
  granularity: Granularity,
  periods: number,
  asof: string,
  now: Date = new Date()
): Period[] {
  const n = Math.max(1, Math.min(12, Math.floor(periods)));
  const out: Period[] = [];

  if (granularity === 'monthly') {
    const { yy, mm } = parseAsofMonthly(asof, now);
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(yy, mm - i, 1));
      out.push(makeMonth(d.getUTCFullYear(), d.getUTCMonth()));
    }
  } else if (granularity === 'quarterly') {
    const { yy, q } = parseAsofQuarterly(asof, now);
    for (let i = 0; i < n; i++) {
      const flatQ = q - i;
      const yearOffset = Math.floor((flatQ - 1) / 4);
      const adjQ = ((flatQ - 1) % 4 + 4) % 4 + 1;
      out.push(makeQuarter(yy + yearOffset, adjQ));
    }
  } else {
    const { yy } = parseAsofYearly(asof, now);
    for (let i = 0; i < n; i++) {
      out.push(makeYear(yy - i));
    }
  }

  return out;
}
