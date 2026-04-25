'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, Cog, KeyRound, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from './theme-provider';

// Mobile-only drawer menu opened from the TopNav hamburger button.
// Replaces the inline Setup/Password/Sign-out controls that get cramped
// on small screens. On ≥md the menu is hidden — those controls render
// directly in the nav.

type Props = {
  username: string;
  isAdmin: boolean;
};

export function MobileMenu({ username, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 md:hidden"
        >
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col safe-pt safe-pb">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Signed in</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  {username}
                  {isAdmin && (
                    <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-lime-100 text-lime-700 dark:bg-lime-900 dark:text-lime-200">
                      admin
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Cog size={18} className="text-slate-500" />
                  Setup
                </Link>
              )}
              <Link
                href="/account/password"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <KeyRound size={18} className="text-slate-500" />
                Change password
              </Link>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="px-3 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Theme</div>
                <div className="grid grid-cols-3 gap-1 px-2 mt-2">
                  <ThemeOpt icon={Sun} label="Light" active={theme === 'light'} onClick={() => setTheme('light')} />
                  <ThemeOpt icon={Moon} label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
                  <ThemeOpt icon={Monitor} label="Auto" active={theme === 'system'} onClick={() => setTheme('system')} />
                </div>
              </div>
            </nav>

            <div className="border-t border-slate-100 dark:border-slate-800 p-2">
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950"
                >
                  <LogOut size={18} />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ThemeOpt({
  icon: Icon, label, active, onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-[11px] font-medium transition ${
        active
          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
