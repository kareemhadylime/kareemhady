import Link from 'next/link';
import { ArrowRight, Mail, ShieldCheck, Leaf } from 'lucide-react';
import { TopNav } from './_components/brand';
import { DomainIcon } from './_components/domain-icon';
import { DOMAINS, DOMAIN_LABELS } from '@/lib/rules/presets';
import { DOMAIN_THEMES } from '@/lib/brand-theme';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';
import type { Domain } from '@/lib/rules/presets';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  // Filter portfolio to domains this user can access.
  const visibleDomains = DOMAINS.filter(d =>
    user ? canAccessDomain(user, d as Domain) : false
  );

  return (
    <>
      <TopNav />
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-10 flex-1">
        <section className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-50 border border-lime-200 text-lime-700 text-xs font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-lime-500 animate-pulse" />
            Holding company portfolio
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-lime-600 via-emerald-600 to-teal-700 bg-clip-text text-transparent">
            Lime Investments Dashboard
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            A single cockpit for every subsidiary — financials, sales,
            operations, and pricing in one place.
          </p>
        </section>

        {!user && (
          <div className="ix-card p-8 text-center space-y-3 max-w-md mx-auto">
            <p className="text-sm text-slate-500">
              Sign in to see the portfolio.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-lime-600 text-white text-sm font-medium hover:bg-lime-700"
            >
              <Leaf size={14} /> Sign in
            </Link>
          </div>
        )}

        {user && visibleDomains.length === 0 && (
          <div className="ix-card p-8 text-center space-y-2 max-w-md mx-auto">
            <ShieldCheck size={24} className="mx-auto text-amber-600" />
            <h2 className="text-lg font-semibold">No subsidiary access</h2>
            <p className="text-sm text-slate-500">
              Your account doesn&apos;t have any domain roles assigned yet. Ask
              an admin to grant access at{' '}
              <code className="text-xs">/admin/users</code>.
            </p>
          </div>
        )}

        {user && visibleDomains.length > 0 && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleDomains.map(d => {
              const theme = DOMAIN_THEMES[d as Domain];
              const label = DOMAIN_LABELS[d as Domain];
              return (
                <Link
                  key={d}
                  href={`/emails/${d}`}
                  className="group ix-card p-5 relative overflow-hidden hover:shadow-lg transition"
                >
                  <div
                    className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${theme.accent.gradientFrom} ${theme.accent.gradientTo} opacity-10 blur-2xl pointer-events-none group-hover:opacity-20 transition`}
                  />
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl inline-flex items-center justify-center ${theme.accent.tint} ${theme.accent.text}`}
                    >
                      <DomainIcon domain={d as Domain} size={24} />
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-slate-400 group-hover:text-lime-600 transition"
                    />
                  </div>
                  <h3 className="text-lg font-bold tracking-tight">{label}</h3>
                  {theme.parentNote && (
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mt-0.5">
                      {theme.parentNote}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2 line-clamp-3">
                    {theme.description}
                  </p>
                </Link>
              );
            })}

            {user.is_admin && (
              <Link
                href="/emails"
                className="group ix-card p-5 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 hover:border-lime-500 hover:bg-lime-50/30 transition text-center"
              >
                <Mail size={28} className="text-slate-400 group-hover:text-lime-600 transition" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  All rules
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Flat view of every rule output across subsidiaries
                </span>
              </Link>
            )}
          </section>
        )}

        <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 pt-4">
          Lime Investments · Holding company to{' '}
          {Object.entries(DOMAIN_THEMES)
            .filter(([k]) => k !== 'lime' && k !== 'personal')
            .map(([, t]) => t.name)
            .join(' · ')}
        </footer>
      </main>
    </>
  );
}
