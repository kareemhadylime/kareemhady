import Link from 'next/link';
import { Eye } from 'lucide-react';
import type { SessionUser } from '@/lib/auth';
import { getActingAsOwnerName } from '@/lib/boat-rental/portal-routing';
import { hasBoatRole } from '@/lib/boat-rental/auth';

// Slate banner shown at the top of every owner-portal page when the
// viewer ALSO holds admin or broker — makes it obvious which "hat"
// they're wearing right now and gives them a one-click route back.
//
// Suppressed for owner-only users (no other portals to act from) and
// for viewers whose owner role doesn't link to a specific owner record.

export async function ActingAsBanner({ viewer }: { viewer: SessionUser }) {
  const ownerName = await getActingAsOwnerName(viewer);
  if (!ownerName) return null;

  const isAdmin = await hasBoatRole(viewer, 'admin');
  const isBroker = await hasBoatRole(viewer, 'broker');
  const otherRoleLabel = isAdmin ? 'Admin' : isBroker ? 'Broker' : null;
  const otherRoleHref = isAdmin
    ? '/emails/boat-rental/admin'
    : isBroker
      ? '/emails/boat-rental/broker'
      : null;
  if (!otherRoleLabel || !otherRoleHref) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
      <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-2 flex-wrap">
        <Eye size={14} className="text-slate-500 shrink-0" />
        <span>
          Viewing as Owner: <strong className="font-semibold">{ownerName}</strong>
          <span className="text-slate-500 dark:text-slate-400 mx-2">·</span>
          You also hold the <strong className="font-semibold">{otherRoleLabel}</strong> role
        </span>
        <Link
          href={otherRoleHref}
          className="ml-auto text-cyan-700 dark:text-cyan-300 font-semibold hover:underline whitespace-nowrap"
        >
          Switch to {otherRoleLabel} →
        </Link>
      </div>
    </div>
  );
}
