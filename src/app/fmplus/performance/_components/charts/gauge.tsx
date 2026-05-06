'use client';
const STATUS: Record<'good' | 'warn' | 'bad', string> = { good: '#22C55E', warn: '#F97316', bad: '#EF4444' };
export function Gauge({ pct, status, label }: { pct: number; status: 'good' | 'warn' | 'bad'; label?: string }) {
  const clamped = Math.max(-1, Math.min(2, pct));
  const ang = 180 - ((clamped + 0.25) / 0.5) * 180;
  const rad = (ang * Math.PI) / 180;
  const cx = 100, cy = 90, r = 70;
  const x = cx + r * Math.cos(rad), y = cy - r * Math.sin(rad);
  return (
    <svg viewBox="0 0 200 110" width="100%" height="110">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#334155" strokeWidth={12} />
      <line x1={cx} y1={cy} x2={x} y2={y} stroke={STATUS[status]} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill={STATUS[status]} />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="14" fill="white" fontWeight="700">{(pct * 100).toFixed(1)}%</text>
      {label && <text x={cx} y={cy + 32} textAnchor="middle" fontSize="10" fill="#94A3B8">{label}</text>}
    </svg>
  );
}
