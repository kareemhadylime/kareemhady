import Link from 'next/link';
import { ChevronRight, BarChart3 } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { FmplusHero } from '@/app/fmplus/_components/fmplus-hero';
import { BilingualToggle } from './_components/bilingual-toggle';
import { BudgetTabStrip } from './_components/budget-tab-strip';

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBudgetView();

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Project Budget</span>
      </TopNav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <FmplusHero
          eyebrow={`FMPLUS · PROJECT BUDGET${user.username ? ` · ${user.username}` : ''}`}
          title="Project Budget"
          subtitle="Multi-year, multi-service contract budgets vs Odoo actuals — input, variance, compare, drill-to-journal."
          icon={BarChart3}
        />

        {/* Tab strip — underline-amber pattern matching /fmplus/financials.
            Pulled into a client component so the active state is computed from
            the current pathname (next/navigation). */}
        <BudgetTabStrip />

        {/* Bilingual toggle floats at the right end of the page above the
            content area so it stays accessible without crowding the hero. */}
        <div className="flex justify-end -mt-3">
          <BilingualToggle />
        </div>

        {children}
      </main>
    </>
  );
}
