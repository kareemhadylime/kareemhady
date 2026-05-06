'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Shield, Briefcase, Sailboat } from 'lucide-react';
import { setImpersonationAction } from '@/app/_actions/impersonation';

// Breadcrumb-tail dropdown that lets a multi-role user switch between
// portals they hold. Renders as the last breadcrumb segment so the
// trail still reads "Lime Investments > Boat Rental > Admin ▾".
//
// Props are pre-filtered server-side: `available` contains only the
// portals the user actually has roles for (per Q3). When there's only
// one portal in `available`, we render a plain non-interactive label
// so the chrome doesn't suggest switching where switching is impossible.

export type PortalKey = 'admin' | 'broker' | 'owner';

export type PortalEntry = {
  key: PortalKey;
  label: string;
  href: string;
  // When set, clicking this entry triggers impersonation of this user_id
  // instead of normal navigation.
  impersonate?: { target_user_id: string; sub_label?: string };
};

type Props = {
  current: PortalKey;
  available: PortalEntry[];
  // When admin is currently impersonating, this shows a "stop" entry
  currentlyImpersonating?: { username: string; redirect_to: string } | null;
};

const ICON_FOR: Record<PortalKey, React.ComponentType<{ size?: number; className?: string }>> = {
  admin: Shield,
  broker: Briefcase,
  owner: Sailboat,
};

const ACCENT_FOR: Record<PortalKey, string> = {
  admin: 'text-cyan-700 dark:text-cyan-300',
  broker: 'text-violet-700 dark:text-violet-300',
  owner: 'text-emerald-700 dark:text-emerald-300',
};

export function PortalSwitcher({ current, available, currentlyImpersonating }: Props) {
  const currentEntry = available.find(p => p.key === current);
  const currentLabel = currentEntry?.label || current;
  const CurrentIcon = ICON_FOR[current];
  const accent = ACCENT_FOR[current];

  // Single-role user with no impersonation options — no menu, just a label.
  if (available.length <= 1 && !currentlyImpersonating) {
    return (
      <span className={`inline-flex items-center gap-1 font-semibold ${accent}`}>
        <CurrentIcon size={13} />
        {currentLabel}
      </span>
    );
  }

  return (
    <Dropdown
      current={current}
      available={available}
      accent={accent}
      CurrentIcon={CurrentIcon}
      currentLabel={currentLabel}
      currentlyImpersonating={currentlyImpersonating}
    />
  );
}

function Dropdown({
  current,
  available,
  accent,
  CurrentIcon,
  currentLabel,
  currentlyImpersonating,
}: {
  current: PortalKey;
  available: PortalEntry[];
  accent: string;
  CurrentIcon: React.ComponentType<{ size?: number; className?: string }>;
  currentLabel: string;
  currentlyImpersonating?: { username: string; redirect_to: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          'inline-flex items-center gap-1 font-semibold rounded px-1.5 py-0.5 -mx-1.5 transition ' +
          accent +
          ' hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
        }
      >
        <CurrentIcon size={13} />
        {currentLabel}
        <ChevronDown size={12} className={open ? 'rotate-180 transition' : 'transition'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute z-30 left-0 mt-1.5 min-w-[200px] rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden"
        >
          {currentlyImpersonating && (
            <form action={setImpersonationAction} className="block">
              <input type="hidden" name="target_user_id" value="" />
              <input type="hidden" name="redirect_to" value={currentlyImpersonating.redirect_to} />
              <button
                type="submit"
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900"
              >
                ↩ Stop acting as @{currentlyImpersonating.username}
              </button>
            </form>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            Switch portal
          </div>
          {available.map(p => {
            const Icon = ICON_FOR[p.key];
            const isCurrent = p.key === current;
            const baseButtonClass =
              'w-full flex items-center gap-2 px-3 py-2 text-sm transition ' +
              (isCurrent
                ? 'bg-slate-50 dark:bg-slate-800/60 font-semibold ' + ACCENT_FOR[p.key]
                : 'text-slate-700 dark:text-slate-200 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:text-cyan-700 dark:hover:text-cyan-300');

            if (p.impersonate) {
              // NOTE: do NOT add onClick={() => setOpen(false)} here.
              // Closing the dropdown triggers a re-render that unmounts the
              // form before the server action submission completes — so the
              // action never fires. The successful redirect from the action
              // will change the page anyway, which removes the dropdown.
              return (
                <form key={p.key} action={setImpersonationAction} className="block">
                  <input type="hidden" name="target_user_id" value={p.impersonate.target_user_id} />
                  <input type="hidden" name="redirect_to" value={p.href} />
                  <button type="submit" className={baseButtonClass}>
                    <Icon size={14} className={ACCENT_FOR[p.key]} />
                    <span className="flex-1 text-left">
                      {p.label}
                      {p.impersonate.sub_label && (
                        <span className="block text-[10px] text-slate-500">{p.impersonate.sub_label}</span>
                      )}
                    </span>
                  </button>
                </form>
              );
            }

            return (
              <Link
                key={p.key}
                href={p.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                className={baseButtonClass}
              >
                <Icon size={14} className={ACCENT_FOR[p.key]} />
                <span className="flex-1">{p.label}</span>
                {isCurrent && <Check size={12} className={ACCENT_FOR[p.key]} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
