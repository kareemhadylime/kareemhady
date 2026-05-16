import type { PaceDateRange } from './types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ymd(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(s: string, n: number): string {
  const { y, m, d } = parseYmd(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((db - da) / 86_400_000) + 1;
}

export function enumerateDays(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function fmtCustomLabel(fromYmd: string, toYmd: string): string {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const aMonth = MONTH_NAMES[a.m - 1];
  const bMonth = MONTH_NAMES[b.m - 1];
  if (a.y === b.y && a.m === b.m) {
    return `${aMonth} ${a.d} — ${bMonth} ${b.d}, ${a.y}`;
  }
  if (a.y === b.y) {
    return `${aMonth} ${a.d} — ${bMonth} ${b.d}, ${a.y}`;
  }
  return `${aMonth} ${a.d}, ${a.y} — ${bMonth} ${b.d}, ${b.y}`;
}

export function parsePeriod(input: string | undefined, referenceYmd: string): PaceDateRange {
  const ref = parseYmd(referenceYmd);

  if (input === 'last-30-days') {
    return {
      from: addDays(referenceYmd, -29),
      to: referenceYmd,
      label: 'Last 30 days',
    };
  }

  if (input === 'last-month') {
    const y = ref.m === 1 ? ref.y - 1 : ref.y;
    const m = ref.m === 1 ? 12 : ref.m - 1;
    return {
      from: ymd(y, m, 1),
      to: ymd(y, m, lastDayOfMonth(y, m)),
      label: `${MONTH_NAMES[m - 1]} ${y}`,
    };
  }

  if (typeof input === 'string' && input.startsWith('custom:')) {
    const [, fromS, toS] = input.split(':');
    if (fromS && toS && YMD.test(fromS) && YMD.test(toS) && fromS <= toS) {
      return { from: fromS, to: toS, label: fmtCustomLabel(fromS, toS) };
    }
  }

  // Default + 'this-month'
  return {
    from: ymd(ref.y, ref.m, 1),
    to: ymd(ref.y, ref.m, lastDayOfMonth(ref.y, ref.m)),
    label: `${MONTH_NAMES[ref.m - 1]} ${ref.y}`,
  };
}

export function shiftPriorYear(range: PaceDateRange): PaceDateRange {
  const a = parseYmd(range.from);
  const b = parseYmd(range.to);
  const py = a.y - 1;
  // Clamp Feb 29 → Feb 28 on the prior year.
  const aDay = Math.min(a.d, lastDayOfMonth(py, a.m));
  const bDay = Math.min(b.d, lastDayOfMonth(b.y - 1, b.m));
  const from = ymd(py, a.m, aDay);
  const to = ymd(b.y - 1, b.m, bDay);
  // Recompute label
  let label: string;
  if (a.y === b.y && a.m === b.m && a.d === 1 && b.d === lastDayOfMonth(a.y, a.m)) {
    label = `${MONTH_NAMES[a.m - 1]} ${py}`;
  } else {
    label = fmtCustomLabel(from, to);
  }
  return { from, to, label };
}
