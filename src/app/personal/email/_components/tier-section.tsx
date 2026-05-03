import { TIER_LABELS } from '@/lib/personal-email/categories';

export function TierSection({
  tier, children,
}: { tier: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const dot = { 1: '🔴', 2: '🟡', 3: '🔵', 4: '⚫' }[tier];
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-slate-500">
        {dot} {TIER_LABELS[tier].toUpperCase()}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}
