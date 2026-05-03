import Link from 'next/link';
import { Building2, BarChart3, ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function FmplusLandingPage() {
  return (
    <>
      <TopNav>
        <span>FMPLUS</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium flex items-center gap-1.5">
            <Building2 size={13} />
            FMPLUS Property &amp; Facility Management
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">FMPLUS</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-xl">
            Back-office operations + Odoo tenant host. Lime Investments subsidiary.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/fmplus/financials"
            className="ix-card p-5 hover:border-amber-300 hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <BarChart3 size={20} className="text-amber-700" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1">
                  Financials
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  P&amp;L · Balance Sheet · Dashboard. Pulled live from Odoo.
                </p>
              </div>
            </div>
          </Link>

          <div className="ix-card p-5 opacity-50 cursor-not-allowed">
            <h2 className="font-semibold text-slate-500">Operations</h2>
            <p className="text-xs text-slate-400 mt-1">Coming soon.</p>
          </div>
        </section>
      </main>
    </>
  );
}
