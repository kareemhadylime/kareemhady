'use client';

import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';

export function PillLink({
  href, label, active,
}: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href}>
      <PillInner label={label} active={active} />
    </Link>
  );
}

function PillInner({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
        active
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
      } ${pending ? 'opacity-70' : ''}`}
    >
      {pending && <Loader2 size={13} className="animate-spin" />}
      {label}
    </span>
  );
}
