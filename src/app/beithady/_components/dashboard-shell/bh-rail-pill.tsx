'use client';

type Props = {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

// Pill button used inside <BHLeftRail> sections. Standard BH theming
// (ink-on-cream when active, transparent-with-mute-border when inactive,
// dim when disabled). Extracted from the original analytics/performance
// LeftRail's inline `Pill` helper so every consumer gets the same look.
export function BHRailPill({ active, children, onClick, disabled, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      aria-disabled={disabled}
      className="rounded-md border px-2.5 py-1.5 text-left text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed"
      style={
        disabled
          ? { background: 'transparent', color: 'var(--bh-steel)', borderColor: 'var(--bh-mute)', opacity: 0.6 }
          : active
            ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)', borderColor: 'var(--bh-ink)' }
            : { background: 'transparent', color: 'var(--bh-ink)', borderColor: 'var(--bh-mute)' }
      }
    >
      {children}
    </button>
  );
}
