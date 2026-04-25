import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { getAvailableBoatPortals } from '@/lib/boat-rental/portal-routing';
import { TopNav } from '@/app/_components/brand';
import { BrokerBottomNav } from '../_components/bottom-nav';
import { OfflineFlushOnOnline } from '../_components/offline-sync';
import { PortalSwitcher } from '../_components/portal-switcher';

export default async function BoatRentalBrokerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireBoatRole('broker', '/emails/boat-rental/broker');
  const portals = await getAvailableBoatPortals(me);
  return (
    <>
      <TopNav>
        <Link href="/emails/boat-rental" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <PortalSwitcher current="broker" available={portals} />
      </TopNav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 pb-safe-bottom-nav md:pb-8">
        {children}
      </main>
      <BrokerBottomNav />
      <OfflineFlushOnOnline />
    </>
  );
}
