export type DateRangePreset = '7d' | '30d' | '90d' | 'lifetime' | 'custom';
export type DateRange = { from: string; to: string; preset: DateRangePreset; compare: boolean };
export type DateRangeParams = { from?: string; to?: string; preset?: string; compare?: string };
export type DateRangeOpts = { today?: string };

export function isValidISODate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function todayIso(opts?: DateRangeOpts): string {
  return opts?.today ?? new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, days: number): string {
  const t = new Date(iso + 'T00:00:00Z').getTime() + days * 86400e3;
  return new Date(t).toISOString().slice(0, 10);
}

export function presetToRange(preset: DateRangePreset, today: string): { from: string; to: string } {
  if (preset === 'lifetime') return { from: '1970-01-01', to: today };
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : preset === '90d' ? 89 : 29;
  return { from: shiftDays(today, -days), to: today };
}

export function parseDateRange(params: DateRangeParams, opts: DateRangeOpts = {}): DateRange {
  const today = todayIso(opts);
  const compare = params.compare === '1';
  if (params.preset === '7d' || params.preset === '30d' || params.preset === '90d' || params.preset === 'lifetime') {
    const r = presetToRange(params.preset, today);
    return { ...r, preset: params.preset, compare };
  }
  if (isValidISODate(params.from) && isValidISODate(params.to) && params.from <= params.to) {
    return { from: params.from, to: params.to, preset: 'custom', compare };
  }
  const r = presetToRange('30d', today);
  return { ...r, preset: '30d', compare };
}

export function derivePriorPeriod(r: { from: string; to: string }): { from: string; to: string } {
  const fromMs = new Date(r.from + 'T00:00:00Z').getTime();
  const toMs = new Date(r.to + 'T00:00:00Z').getTime();
  const spanDays = Math.round((toMs - fromMs) / 86400e3) + 1; // inclusive
  return { from: shiftDays(r.from, -spanDays), to: shiftDays(r.from, -1) };
}
