import { ShieldCheck, Mail } from 'lucide-react';
import { TopNav } from './_components/brand';
import { ModuleCard } from './_components/module-card';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <TopNav />
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-12 flex-1">
        <section className="text-center space-y-4 pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-600" />
            Phase 2 · KIKA Shopify aggregator live
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Your inbox, distilled.
          </h1>
          <p className="text-slate-500 max-w-xl mx-auto">
            Connect Gmail mailboxes, set rules, and let Claude turn order
            confirmations and notifications into clean dashboards.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ModuleCard
            href="/admin"
            title="Admin"
            description="Connected mailboxes and email rules."
            Icon={ShieldCheck}
            accent="indigo"
          />
          <ModuleCard
            href="/emails"
            title="Emails"
            description="Rule outputs and aggregated reports."
            Icon={Mail}
            accent="violet"
          />
        </section>
      </main>
    </>
  );
}
