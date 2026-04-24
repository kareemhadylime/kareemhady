import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { TopNav } from '@/app/_components/brand';

export default async function BoatRentalBrokerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireBoatRole('broker', '/emails/boat-rental/broker');
  return (
    <>
      <TopNav>
        <Link href="/emails/boat-rental/broker" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Broker</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-6 py-8 flex-1">{children}</main>
    </>
  );
}
