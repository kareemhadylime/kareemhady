'use client';
import type { PerfUrlState } from '../_hooks/use-url-state';

type Props = {
  state: PerfUrlState;
  onChange: (patch: Partial<PerfUrlState>) => void;
  collapsed?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
};

const PERIODS = [
  { value: undefined, label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
] as const;

const BUILDINGS = [
  { value: 'all', label: 'All' },
  { value: 'BH-26', label: 'BH-26' },
  { value: 'BH-73', label: 'BH-73' },
  { value: 'BH-435', label: 'BH-435' },
  { value: 'BH-OK', label: 'BH-OK' },
  { value: 'OTHER', label: 'Other' },
] as const;

const COMPARES = [
  { value: 'yesterday', label: 'vs Yesterday' },
  { value: 'last-week', label: 'vs Last Week' },
  { value: 'last-month', label: 'vs Last Month' },
  { value: 'last-year', label: 'vs Last Year' },
  { value: 'none', label: 'None' },
] as const;

export function LeftRail({ state, onChange, collapsed = false, pinned = false, onTogglePin }: Props) {
  if (collapsed) {
    return (
      <aside
        role="region"
        aria-label="Filters (collapsed)"
        className="flex flex-col items-center gap-2 border-r border-[#003462]/10 bg-white py-4"
      >
        <CollapsedIcon emoji="📅" title="Period" />
        <CollapsedIcon emoji="🏢" title={`Building: ${state.building}`} />
        <CollapsedIcon emoji="⇄" title={`Compare: ${state.compare}`} />
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? 'Unpin filters rail' : 'Pin filters rail open'}
          aria-pressed={pinned}
          className={
            'mt-auto flex h-8 w-8 items-center justify-center rounded text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 ' +
            (pinned ? 'bg-[#003462] text-white' : 'text-[#6077a6] hover:bg-[#eae9f3]')
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
      className="flex flex-col gap-4 border-r border-[#003462]/10 bg-white px-4 py-5"
    >
      <Section title="Period">
        {/* Period pills are display-only stubs in Phase 1 — real period semantics arrive in later phases. */}
        {PERIODS.map((p) => (
          <Pill key={p.label} active={p.label === 'Today'}>{p.label}</Pill>
        ))}
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
      <div className="mt-auto pt-2 border-t border-[#003462]/10">
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? 'Unpin filters rail (allow auto-collapse)' : 'Pin filters rail open'}
          aria-pressed={pinned}
          className={
            'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 ' +
            (pinned ? 'bg-[#003462] text-white' : 'text-[#6077a6] hover:bg-[#eae9f3]')
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
      className="flex h-7 w-7 items-center justify-center rounded text-xs text-[#003462]/60 select-none"
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[#6077a6]/70">{title}</h4>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Pill({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-md border px-2.5 py-1.5 text-left text-[11px] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 ' +
        (active ? 'border-[#003462] bg-[#003462] text-white' : 'border-[#003462]/10 bg-white text-[#003462] hover:bg-[#eae9f3]')
      }
    >
      {children}
    </button>
  );
}
