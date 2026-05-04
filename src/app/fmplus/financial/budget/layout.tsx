// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
import { TopNav } from '@/app/_components/brand';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SubTabs } from './_components/sub-tabs';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BudgetSectionLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!canAccessDomain(user, 'fmplus')) notFound();
  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="ix-link">FMPLUS</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/fmplus/financial" className="ix-link">Financial</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Project Budget</span>
      </TopNav>
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6 flex-1">
        <header>
          <p className="text-xs uppercase tracking-wide text-amber-700 font-medium">FMPLUS · Financial</p>
          <h1 className="text-3xl font-bold tracking-tight">Project Budget</h1>
        </header>
        <SubTabs />
        {children}
      </main>
    </>
  );
}
