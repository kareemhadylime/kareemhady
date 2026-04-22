import Link from 'next/link';
import { Leaf, LogOut, KeyRound } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

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
    <Link href="/" className="inline-flex items-center gap-2 group">
      <span
        className={`inline-flex items-center justify-center ${s.pill} rounded-lg bg-gradient-to-br from-lime-500 to-emerald-600 text-white shadow-sm shadow-lime-500/20`}
      >
        <Leaf size={s.icon} strokeWidth={2.4} />
      </span>
      <span className={`font-bold tracking-tight ${s.text}`}>
        Lime
        <span className="text-slate-400 font-semibold ml-1">Investments</span>
      </span>
    </Link>
  );
}

export async function TopNav({ children }: { children?: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200/70">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Brand />
        <nav className="text-sm text-slate-600 flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-4 min-w-0 truncate">{children}</div>
          {user && (
            <>
              <span className="hidden sm:inline-block text-[11px] text-slate-500">
                {user.username}
                {user.is_admin && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-lime-100 text-lime-700">
                    admin
                  </span>
                )}
              </span>
              <Link
                href="/account/password"
                title="Change password"
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition"
              >
                <KeyRound size={12} />
                <span className="hidden sm:inline">Password</span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  title="Sign out"
                  className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition"
                >
                  <LogOut size={12} />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
