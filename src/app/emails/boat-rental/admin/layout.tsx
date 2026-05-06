import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireBoatRole } from '@/lib/boat-rental/auth';
import { getAvailableBoatPortals, getImpersonationTargetsForAdmin } from '@/lib/boat-rental/portal-routing';
import { TopNav } from '@/app/_components/brand';
import { PortalSwitcher, type PortalEntry } from '../_components/portal-switcher';
import { ImpersonationBanner } from '@/app/_components/impersonation-banner';

export default async function BoatRentalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireBoatRole('admin', '/emails/boat-rental/admin');
  const portalsBase = await getAvailableBoatPortals(me);
  const portals: PortalEntry[] = [...portalsBase];

  // If admin is NOT currently impersonating, add act-as entries for missing roles.
  if (me && !me.impersonation && me.is_admin) {
    const targets = await getImpersonationTargetsForAdmin();
    const hasBroker = portalsBase.some(p => p.key === 'broker');
    const hasOwner = portalsBase.some(p => p.key === 'owner');
    if (!hasBroker && targets.broker) {
      portals.push({
        key: 'broker',
        label: 'Broker',
        href: '/emails/boat-rental/broker',
        impersonate: {
          target_user_id: targets.broker.user_id,
          sub_label: `act as @${targets.broker.username}`,
        },
      });
    }
    if (!hasOwner && targets.owner) {
      portals.push({
        key: 'owner',
        label: 'Owner',
        href: '/emails/boat-rental/owner',
        impersonate: {
          target_user_id: targets.owner.user_id,
          sub_label: targets.owner.owner_name
            ? `act as ${targets.owner.owner_name}`
            : `act as @${targets.owner.username}`,
        },
      });
    }
  }

  return (
    <>
      <TopNav>
        <Link href="/emails/boat-rental" className="ix-link">Boat Rental</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <PortalSwitcher
          current="admin"
          available={portals}
          currentlyImpersonating={
            me?.impersonation
              ? { username: me.username, redirect_to: '/emails/boat-rental/admin' }
              : null
          }
        />
      </TopNav>
      {me?.impersonation && (
        <ImpersonationBanner
          impersonatedUsername={me.username}
          originalAdminUsername={me.impersonation.original_admin_username}
          redirectTo="/emails/boat-rental/admin"
        />
      )}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1">{children}</main>
    </>
  );
}
