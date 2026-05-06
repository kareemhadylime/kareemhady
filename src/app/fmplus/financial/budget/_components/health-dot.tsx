// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import type { VarianceColor } from '@/lib/fmplus/budget/types';

const COLORS: Record<VarianceColor, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red:   'bg-rose-500',
};

export function HealthDot({ color, title }: { color: VarianceColor; title?: string }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${COLORS[color]}`} title={title} />;
}
