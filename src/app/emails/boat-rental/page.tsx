import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getBoatRoles } from '@/lib/boat-rental/auth';

// Role-aware landing — /emails/boat-rental redirects to the right
// sub-portal based on which role the user has. App-level admins
// default to the admin view.
export default async function BoatRentalLanding() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/emails/boat-rental');

  if (user.is_admin) redirect('/emails/boat-rental/admin');

  const roles = await getBoatRoles(user);
  if (roles.some(r => r.role === 'admin')) redirect('/emails/boat-rental/admin');
  if (roles.some(r => r.role === 'broker')) redirect('/emails/boat-rental/broker');
  if (roles.some(r => r.role === 'owner')) redirect('/emails/boat-rental/owner');

  // Domain access but no role — shouldn't happen with proper setup; show
  // a friendly message so admin can assign a role.
  return (
    <main className="max-w-xl mx-auto px-6 py-20 text-center">
      <h1 className="text-2xl font-bold mb-2">Boat Rental</h1>
      <p className="text-sm text-slate-500">
        You have access to this domain but no role assigned yet. Ask the admin
        to assign you as Broker or Owner.
      </p>
    </main>
  );
}
