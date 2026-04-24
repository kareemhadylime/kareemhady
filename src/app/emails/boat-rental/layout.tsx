import { requireDomainAccess } from '@/lib/auth';

// Domain-level gate. Sub-routes (admin / broker / owner) add their own
// role check on top via requireBoatRole().
export default async function BoatRentalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDomainAccess('boat-rental');
  return <>{children}</>;
}
