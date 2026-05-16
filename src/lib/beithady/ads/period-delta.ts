export type PeriodDelta = {
  direction: 'up' | 'down' | 'flat' | 'new';
  pctChange: number | null;
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
};

export function computePeriodDelta(
  current: number,
  prior: number,
  opts: { reverseColor?: boolean } = {}
): PeriodDelta | null {
  if (current === 0 && prior === 0) return null;
  if (prior === 0 && current > 0) {
    return { direction: 'new', pctChange: null, label: 'new', tone: opts.reverseColor ? 'negative' : 'positive' };
  }
  const pct = ((current - prior) / prior) * 100;
  const rounded = Math.round(pct);
  if (Math.abs(pct) < 0.5) {
    return { direction: 'flat', pctChange: 0, label: '→', tone: 'neutral' };
  }
  const direction = pct > 0 ? 'up' : 'down';
  const arrow = direction === 'up' ? '↑' : '↓';
  const tonePositive = direction === 'up' ? !opts.reverseColor : !!opts.reverseColor;
  return {
    direction,
    pctChange: rounded,
    label: `${arrow} ${Math.abs(rounded)}%`,
    tone: tonePositive ? 'positive' : 'negative',
  };
}
