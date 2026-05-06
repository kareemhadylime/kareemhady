import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';

export default async function PerformanceLayout({ children }: { children: React.ReactNode }) {
  await requireBudgetView();
  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Performance</span>
      </TopNav>
      <main className="flex-1 flex">
        {/* Sidebar slot (filled by per-page sidebar component) and main content slot live in children. */}
        {children}
      </main>
    </>
  );
}
