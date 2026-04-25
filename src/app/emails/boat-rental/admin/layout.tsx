import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { getAvailableBoatPortals } from '@/lib/boat-rental/portal-routing';
import { TopNav } from '@/app/_components/brand';
import { PortalSwitcher } from '../_components/portal-switcher';

export default async function BoatRentalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireBoatRole('admin', '/emails/boat-rental/admin');
  const portals = await getAvailableBoatPortals(me);
  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">Emails</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/boat-rental" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <PortalSwitcher current="admin" available={portals} />
      </TopNav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1">{children}</main>
    </>
  );
}
