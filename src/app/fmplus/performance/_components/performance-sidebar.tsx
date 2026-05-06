// src/app/fmplus/performance/_components/performance-sidebar.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Pin, Calendar, List, Eye, Languages, Menu } from 'lucide-react';
import { PeriodChips } from './period-chips';
import { VisibleSections } from './visible-sections';
import { ProjectFilter } from './project-filter';
import { ContractSwitcher } from './contract-switcher';

const COLLAPSE_DELAY_MS = 3000;
const PIN_KEY = 'fmplus_perf_sidebar_pinned';

interface Props {
  resolvedPeriodLabel: string;
  contextLine?: string;
  jumpAnchors?: { id: string; label: string }[];
  contracts?: { id: number; name: string; customer?: string | null }[];
  currentContractId?: number;
}

export function PerformanceSidebar({ resolvedPeriodLabel, contextLine, jumpAnchors, contracts, currentContractId }: Props) {
  const [pinned, setPinned] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPinned(localStorage.getItem(PIN_KEY) === '1');
  }, []);

  function clearTimer() { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }
  function onEnter() { clearTimer(); setCollapsed(false); }
  function onLeave() {
    if (pinned) return;
    clearTimer();
    timerRef.current = setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS);
  }
  function togglePin() {
    const next = !pinned;
    setPinned(next);
    localStorage.setItem(PIN_KEY, next ? '1' : '0');
    if (next) setCollapsed(false);
  }

  const desktopWidth = collapsed && !pinned ? 56 : 240;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-14 left-2 z-40 p-2 rounded-lg bg-slate-800 text-fmplus-yellow"
        aria-label="Open Performance navigation"
      >
        <Menu size={18} />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        style={{ width: desktopWidth }}
        className={`fixed left-0 top-12 bottom-0 z-30 bg-slate-900/95 border-r border-slate-700/50 transition-[width,transform] duration-200 ease-out overflow-hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        aria-label="Performance Dashboard navigation"
      >
        <div className="h-full overflow-y-auto py-4 flex flex-col gap-6">
          {!collapsed && (
            <>
              {contextLine && <p className="text-xs text-slate-300 px-3">{contextLine}</p>}

              <section>
                <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Period</h4>
                <PeriodChips resolvedLabel={resolvedPeriodLabel} />
              </section>

              {contracts && contracts.length > 1 && (
                <section>
                  <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">
                    {currentContractId ? 'Switch Contract' : 'Projects'}
                  </h4>
                  {currentContractId
                    ? <ContractSwitcher contracts={contracts} currentContractId={currentContractId} variant="sidebar" />
                    : <ProjectFilter contracts={contracts} />
                  }
                </section>
              )}

              {jumpAnchors && jumpAnchors.length > 0 && (
                <section>
                  <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Jump To</h4>
                  <ul className="flex flex-col">
                    {jumpAnchors.map(a => (
                      <li key={a.id}>
                        <a
                          href={`#${a.id}`}
                          onClick={() => setMobileOpen(false)}
                          className="block px-3 py-1 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-fmplus-yellow"
                        >{a.label}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h4 className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold px-3 mb-2">Visible Sections</h4>
                <VisibleSections />
              </section>

              <div className="mt-auto px-3 space-y-2">
                <button onClick={togglePin} className={`hidden md:flex items-center gap-2 text-xs px-2 py-1.5 rounded transition ${pinned ? 'bg-fmplus-yellow text-fmplus-black' : 'text-slate-400 hover:text-fmplus-yellow'}`}>
                  <Pin size={14} /> {pinned ? 'Pinned' : 'Pin sidebar'}
                </button>
              </div>
            </>
          )}

          {collapsed && !pinned && (
            <div className="flex flex-col items-center gap-3 pt-2">
              <Calendar size={18} className="text-slate-400" />
              <List size={18} className="text-slate-400" />
              <Eye size={18} className="text-slate-400" />
              <Pin size={18} className="text-slate-400" />
              <Languages size={18} className="text-slate-400" />
            </div>
          )}
        </div>
      </aside>
      <style>{`@media (min-width: 768px) { body { padding-left: ${desktopWidth}px; transition: padding-left 200ms ease-out; } }`}</style>
    </>
  );
}
