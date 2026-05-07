'use client';
import type { PerfUrlState } from '../_hooks/use-url-state';

type Props = {
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
  /** Latest snapshot date in 'YYYY-MM-DD' (Cairo) — used to compute Yesterday. */
  snapshotDate: string;
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};

function ymdMinusOne(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

const BUILDINGS = [
  { value: 'all', label: 'All' },
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
] as const;
// `PERIODS` constant inlined into the Period section now that the pills
// have real onClick handlers (Today / Yesterday / This week + an active
// indicator for arbitrary `?date=` dates set via the snapshot scrubber).

const COMPARES = [
  { value: 'yesterday', label: 'vs Yesterday' },
  { value: 'last-week', label: 'vs Last Week' },
  { value: 'last-month', label: 'vs Last Month' },
  { value: 'last-year', label: 'vs Last Year' },
  { value: 'none', label: 'None' },
] as const;

export function LeftRail({ state, onChange, snapshotDate, collapsed = false, pinned = false, onTogglePin }: Props) {
  // Compute Today vs Yesterday based on the URL date param.
  // Today  = no ?date= (latest snapshot)
  // Yesterday = ?date=<latest - 1 day>
  const yesterdayYmd = ymdMinusOne(snapshotDate);
  const isYesterday = state.date === yesterdayYmd;
  const isToday = !state.date && !isYesterday;
  const isOtherDate = !!state.date && !isYesterday;
  if (collapsed) {
    return (
      <aside
        role="region"
        aria-label="Filters (collapsed)"
        className="flex flex-col items-center gap-2 py-4"
        style={{ background: 'var(--bh-cream)', borderRight: '1px solid var(--bh-mute)' }}
      >
        <CollapsedIcon emoji="📅" title="Period" />
        <CollapsedIcon emoji="🏢" title={`Building: ${state.building}`} />
        <CollapsedIcon emoji="⇄" title={`Compare: ${state.compare}`} />
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
      <Section title="Period">
        <Pill active={isToday} onClick={() => onChange({ date: undefined })}>
          Today
        </Pill>
        <Pill active={isYesterday} onClick={() => onChange({ date: yesterdayYmd })}>
          Yesterday
        </Pill>
        <Pill disabled title="Weekly aggregate not yet supported — use the snapshot scrubber for historical days.">
          This week <span style={{ opacity: 0.7 }}>· soon</span>
        </Pill>
        {isOtherDate && (
          <Pill active onClick={() => onChange({ date: undefined })} title="Click to return to latest">
            {state.date}
          </Pill>
        )}
      </Section>
      <Section title="Building">
        {BUILDINGS.map((b) => (
          <Pill key={b.value} active={state.building === b.value} onClick={() => onChange({ building: b.value })}>
            {b.label}
          </Pill>
        ))}
      </Section>
      <Section title="Compare">
        {COMPARES.map((c) => (
          <Pill key={c.value} active={state.compare === c.value} onClick={() => onChange({ compare: c.value })}>
            {c.label}
          </Pill>
        ))}
      </Section>
      {/* Pin toggle at the bottom of the expanded rail */}
      <div className="mt-auto pt-2" style={{ borderTop: '1px solid var(--bh-mute)' }}>
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? 'Unpin filters rail (allow auto-collapse)' : 'Pin filters rail open'}
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
    </aside>
  );
}

function CollapsedIcon({ emoji, title }: { emoji: string; title: string }) {
  return (
    <span
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-xs select-none"
      style={{ color: 'var(--bh-steel)' }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4
        className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em]"
        style={{ color: 'var(--bh-steel)' }}
      >
        {title}
      </h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Pill({
  active,
  children,
  onClick,
  disabled,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
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
