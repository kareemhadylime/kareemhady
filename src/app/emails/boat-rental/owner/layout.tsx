import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { getAvailableBoatPortals } from '@/lib/boat-rental/portal-routing';
import { TopNav } from '@/app/_components/brand';
import { OwnerBottomNav } from '../_components/bottom-nav';
import { OfflineFlushOnOnline } from '../_components/offline-sync';
import { PortalSwitcher } from '../_components/portal-switcher';
import { ActingAsBanner } from '../_components/acting-as-banner';

export default async function BoatRentalOwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireBoatRole('owner', '/emails/boat-rental/owner');
  const portals = await getAvailableBoatPortals(me);
  return (
    <>
      <TopNav>
        <Link href="/emails/boat-rental" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <PortalSwitcher current="owner" available={portals} />
      </TopNav>
      <ActingAsBanner viewer={me} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 pb-safe-bottom-nav md:pb-8">
        {children}
      </main>
      <OwnerBottomNav />
      <OfflineFlushOnOnline />
    </>
  );
}
