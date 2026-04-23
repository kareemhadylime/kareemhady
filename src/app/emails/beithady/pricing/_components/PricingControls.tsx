'use client';

import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

// Horizon tab (7/30/60 days forward occupancy). Built on Next.js <Link>
// so useLinkStatus can show a spinner while the server rerenders.
function HorizonInner({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active
          ? 'bg-rose-600 text-white shadow-sm hover:bg-rose-700'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      } ${pending ? 'opacity-80 cursor-wait' : ''}`}
    >
      {pending && <Loader2 size={13} className="animate-spin" />}
      {pending ? 'Loading…' : label}
    </span>
  );
}

export function PricingHorizonTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <HorizonInner label={label} active={active} />
    </Link>
  );
}

// Snapshot-date pick link (same pattern, different color palette).
export function SnapshotDateLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href}>
      <SnapshotInner label={label} active={active} />
    </Link>
  );
}

function SnapshotInner({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      } ${pending ? 'opacity-80 cursor-wait' : ''}`}
    >
      {pending && <Loader2 size={11} className="animate-spin" />}
      {label}
    </span>
  );
}
