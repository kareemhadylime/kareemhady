import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { TopNav } from '../_components/brand';
import { ModuleCard } from '../_components/module-card';

export const dynamic = 'force-dynamic';

export default function EmailsHome() {
  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Emails
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Reports &amp; outputs</h1>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ModuleCard
            href="/emails/output"
            title="Rules output"
            description="Live dashboards from your enabled rules."
            Icon={LayoutDashboard}
            accent="violet"
          />
        </section>
      </main>
    </>
  );
}
