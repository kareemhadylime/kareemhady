import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Settings, UserCog, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '../_components/fmplus-hero';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function FmplusSetupLandingPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/fmplus/setup');
  if (!me.is_admin) notFound();

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="hover:text-fmplus-gold">FMPLUS</Link>
        <span className="text-slate-400">/</span>
        <span>Setup</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        <FmplusHero
          eyebrow="FMPLUS · ADMINISTRATION"
          title="Setup"
          subtitle="Manage who can access FM+ and what they can do."
          icon={Settings}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/fmplus/setup/users"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <UserCog size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  User Access
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Add, edit, and disable FM+ users. Assign app roles inside FM+.
                </p>
              </div>
            </div>
          </Link>

          {/* Future cards (integrations, notifications, etc.) live here. */}
        </section>
      </main>
    </>
  );
}
