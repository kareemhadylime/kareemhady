import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { TopNav } from '@/app/_components/brand';

export default async function BoatRentalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBoatRole('admin', '/emails/boat-rental/admin');
  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/boat-rental" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Admin</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1">{children}</main>
    </>
  );
}
