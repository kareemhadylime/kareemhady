import Link from 'next/link';
import { Leaf, LogOut, KeyRound, Cog } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { ThemeToggle } from './theme-toggle';
import { MobileMenu } from './mobile-menu';

// Lime Investments — holding company brand. Fresh green palette reads as
// growth/portfolio health. Name kept brief so subsidiary breadcrumbs
// (BEITHADY, KIKA, etc.) read cleanly in the nav.

export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { icon: 16, text: 'text-sm', pill: 'h-7 w-7' },
    md: { icon: 20, text: 'text-base', pill: 'h-8 w-8' },
    lg: { icon: 28, text: 'text-2xl', pill: 'h-10 w-10' },
  } as const;
  const s = sizes[size];
  return (
    <Link href="/" className="inline-flex items-center gap-2 group min-w-0">
      <span
        className={`inline-flex items-center justify-center ${s.pill} rounded-lg bg-gradient-to-br from-lime-500 to-emerald-600 text-white shadow-sm shadow-lime-500/20 shrink-0`}
      >
        <Leaf size={s.icon} strokeWidth={2.4} />
      </span>
      <span className={`font-bold tracking-tight ${s.text} truncate`}>
        Lime
        <span className="text-slate-400 dark:text-slate-500 font-semibold ml-1 hidden sm:inline">Investments</span>
      </span>
    </Link>
  );
}

export async function TopNav({ children }: { children?: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/70 dark:border-slate-800/70 safe-pt">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Brand />
          {/* Breadcrumb children — stay visible at all sizes. Avoid
              `truncate` here because that sets overflow:hidden and
              clips popover-style children like the PortalSwitcher
              dropdown. The trail is always short (3 segments), no
              ellipsis needed. */}
          {children && (
            <nav className="text-sm text-slate-600 dark:text-slate-300 hidden sm:flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">{children}</div>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle — visible on all sizes, lightweight icon button */}
          <ThemeToggle />

          {user && (
            <>
              {/* Desktop controls (≥md) */}
              <span className="hidden md:inline-flex items-center text-[11px] text-slate-500 dark:text-slate-400 gap-1.5 ml-2">
                {user.username}
                {user.is_admin && (
                  <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-lime-100 text-lime-700 dark:bg-lime-900 dark:text-lime-200">
                    admin
                  </span>
                )}
              </span>
              {user.is_admin && (
                <Link
                  href="/admin"
                  title="Setup"
                  className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition"
                >
                  <Cog size={14} />
                  Setup
                </Link>
              )}
              <Link
                href="/account/password"
                title="Change password"
                className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition"
              >
                <KeyRound size={14} />
                Password
              </Link>
              <form action="/api/auth/logout" method="post" className="hidden md:block">
                <button
                  type="submit"
                  title="Sign out"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </form>

              {/* Mobile drawer trigger (<md) */}
              <MobileMenu username={user.username} isAdmin={user.is_admin} />
            </>
          )}
        </div>
      </div>

      {/* Breadcrumb children on small screens — separate row, scrollable */}
      {children && (
        <div className="sm:hidden border-t border-slate-200/70 dark:border-slate-800/70 px-4 py-2 overflow-x-auto">
          <nav className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 whitespace-nowrap">
            {children}
          </nav>
        </div>
      )}
    </header>
  );
}
