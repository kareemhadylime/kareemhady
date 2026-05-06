'use client';
import { useEffect } from 'react';
import { useVisibility } from '../_hooks/use-visibility';
import { PANELS, PANEL_GROUPS, type PanelId, type PanelGroupId } from '../_lib/panel-registry';

type Props = { onClose: () => void };

export function CustomizeDrawer({ onClose }: Props) {
  const { visibility, setPanel, reset } = useVisibility();

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const groups = Object.keys(PANEL_GROUPS) as PanelGroupId[];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div className="absolute inset-0 bg-[#003462]/40" />
      <aside
        className="absolute right-0 top-0 flex h-full w-96 flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Customize dashboard"
      >
        <header className="flex items-center justify-between border-b border-[#003462]/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-[#003462]" style={{ fontFamily: 'var(--bh-heading)' }}>⚙ Customize</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded text-[#6077a6] hover:text-[#003462] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
            aria-label="Close customize drawer"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {groups.map((groupId) => {
            const groupPanels = PANELS.filter((p) => p.group === groupId);
            if (groupPanels.length === 0) return null;
            return (
              <section key={groupId} className="mb-5">
                <h3 className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[#6077a6]/70">
                  {PANEL_GROUPS[groupId]}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {groupPanels.map((p) => (
                    <li key={p.id}>
                      <ToggleRow
                        id={p.id}
                        label={p.label}
                        checked={visibility[p.id]}
                        onChange={(next) => setPanel(p.id, next)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="border-t border-[#003462]/10 px-6 py-3 flex justify-between">
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-[#003462]/15 bg-white px-3 py-1.5 text-xs text-[#003462] hover:bg-[#eae9f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#003462] bg-[#003462] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#003462]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
          >
            Done
          </button>
        </footer>
      </aside>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: PanelId;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      htmlFor={`vis-${id}`}
      className="flex items-center justify-between rounded-md border border-[#003462]/10 bg-white px-3 py-2 text-[12px] text-[#003462] hover:bg-[#eae9f3] cursor-pointer"
    >
      <span>{label}</span>
      <span className="relative inline-flex">
        <input
          id={`vis-${id}`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-5 w-9 cursor-pointer appearance-none rounded-full bg-[#eae9f3] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1 checked:bg-[#003462]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4"
        />
      </span>
    </label>
  );
}
