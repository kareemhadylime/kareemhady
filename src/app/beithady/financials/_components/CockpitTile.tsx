import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function CockpitTile(props: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string | null;
  variant?: 'default' | 'new' | 'audit';
}) {
  const variantClass =
    props.variant === 'new'
      ? 'border-green-300 bg-green-50/40'
      : props.variant === 'audit'
        ? 'border-red-300 bg-red-50/40'
        : 'border-slate-200 bg-white';
  const Icon = props.icon;
  return (
    <Link
      href={props.href}
      className={`block rounded-lg border ${variantClass} p-4 hover:shadow-sm transition`}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className="h-5 w-5 text-slate-500" />
        {props.badge ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {props.badge}
          </span>
        ) : null}
      </div>
      <div className="text-sm font-semibold mb-1">{props.title}</div>
      <div className="text-xs text-slate-500">{props.description}</div>
    </Link>
  );
}
