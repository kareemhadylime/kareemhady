import Link from 'next/link';
import { Building2, BarChart3, ChevronRight, Wallet, Gauge, ClipboardList, Settings } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from './_components/fmplus-hero';

export const dynamic = 'force-dynamic';

export default function FmplusLandingPage() {
  return (
    <>
      <TopNav>
        <span>FMPLUS</span>
      </TopNav>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <FmplusHero
          eyebrow="FMPLUS · PROPERTY &amp; FACILITY MANAGEMENT"
          title="FMPLUS"
          subtitle="Back-office operations + Odoo tenant host. Lime Investments subsidiary."
          icon={Building2}
        />

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/fmplus/financials"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <BarChart3 size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Financials
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  P&amp;L · Balance Sheet · Dashboard. Pulled live from Odoo.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/fmplus/financial/budget"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <Wallet size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Project Budget
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Per-project budgets vs Odoo actuals. Variance · Compare · Import · Drill-to-journal.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/fmplus/performance"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <Gauge size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Performance Dashboard
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Budget vs Actual at a glance — KPIs, charts, drill-throughs to journals. Last Month by default.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/fmplus/setup"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <Settings size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Setup
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  User access · FM+ app roles · integrations.
                </p>
              </div>
            </div>
          </Link>

          <Link
            href="/fmplus/shift-report"
            className="ix-card p-5 hover:border-fmplus-yellow dark:hover:border-fmplus-gold hover:shadow-md transition group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-fmplus-yellow/15 dark:bg-fmplus-gold/20">
                <ClipboardList size={20} className="text-fmplus-black dark:text-fmplus-yellow" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-1 text-slate-900 dark:text-slate-100">
                  Shift Reports
                  <ChevronRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition" />
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  تقارير الوردية اليومية — Security, Cleaning, Pest Control, Landscape. Auto-WhatsApp delivery.
                </p>
              </div>
            </div>
          </Link>
        </section>
      </main>
    </>
  );
}
