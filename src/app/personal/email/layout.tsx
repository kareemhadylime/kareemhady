import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';

export const dynamic = 'force-dynamic';

export default function PersonalEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/personal" className="ix-link">Personal</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Email</span>
      </TopNav>
      {children}
    </>
  );
}
