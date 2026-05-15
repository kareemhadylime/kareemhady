'use client';

export type BHRailSection = {
  title: string;
  children: React.ReactNode;
};

export type BHRailCollapsedIcon = {
  emoji: string;
  title: string;
};

type Props = {
  sections: BHRailSection[];
  collapsedIcons?: BHRailCollapsedIcon[];
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};

// Filter rail for BH data dashboards. Doesn't know what the filters are —
// consumers compose the actual controls (typically <BHRailPill> instances)
// inside each section's `children`. When `collapsed=true` and
// `collapsedIcons` is provided, the rail shrinks to a ~44px-wide icon strip.
export function BHLeftRail({
  sections,
  collapsedIcons,
  collapsed = false,
  pinned = false,
  onTogglePin,
}: Props) {
  if (collapsed) {
    return (
      <aside
        role="region"
        aria-label="Filters (collapsed)"
        className="flex flex-col items-center gap-2 py-4"
        style={{ background: 'var(--bh-cream)', borderRight: '1px solid var(--bh-mute)' }}
      >
        {collapsedIcons?.map((icon, i) => (
          <span
            key={i}
            title={icon.title}
            className="flex h-7 w-7 items-center justify-center rounded text-xs select-none"
            style={{ color: 'var(--bh-steel)' }}
            aria-hidden="true"
          >
            {icon.emoji}
          </span>
        ))}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? 'Unpin filters rail' : 'Pin filters rail open'}
            aria-pressed={pinned}
            className="mt-auto flex h-8 w-8 items-center justify-center rounded text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={
              pinned
                ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)' }
                : { color: 'var(--bh-steel)' }
            }
          >
            📌
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside
      role="region"
      aria-label="Filters"
      className="flex flex-col gap-4 px-4 py-5"
      style={{ background: 'var(--bh-cream)', borderRight: '1px solid var(--bh-mute)' }}
    >
      {sections.map((section, i) => (
        <div key={i}>
          <h4
            className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--bh-steel)' }}
          >
            {section.title}
          </h4>
          <div className="flex flex-col gap-1">{section.children}</div>
        </div>
      ))}
      {onTogglePin && (
        <div className="mt-auto pt-2" style={{ borderTop: '1px solid var(--bh-mute)' }}>
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={
              pinned
                ? { background: 'var(--bh-ink)', color: 'var(--bh-cream)' }
                : { color: 'var(--bh-steel)' }
            }
          >
            <span>📌 Pin rail</span>
            <span aria-hidden="true">{pinned ? 'on' : 'off'}</span>
          </button>
        </div>
      )}
    </aside>
  );
}
