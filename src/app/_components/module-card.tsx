import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';

const ACCENTS = {
  indigo: { grad: 'from-indigo-500 to-indigo-700', text: 'text-indigo-600', bg: 'bg-indigo-50' },
  violet: { grad: 'from-violet-500 to-violet-700', text: 'text-violet-600', bg: 'bg-violet-50' },
  emerald: { grad: 'from-emerald-500 to-emerald-700', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber: { grad: 'from-amber-500 to-amber-700', text: 'text-amber-600', bg: 'bg-amber-50' },
  rose: { grad: 'from-rose-500 to-rose-700', text: 'text-rose-600', bg: 'bg-rose-50' },
} as const;

export function ModuleCard({
  href,
  title,
  description,
  Icon,
  accent = 'indigo',
}: {
  href: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <Link
      href={href}
      className="group relative block ix-card overflow-hidden p-6 hover:shadow-md hover:-translate-y-0.5 transition"
    >
      <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${a.grad} opacity-10 blur-2xl pointer-events-none`} />
      <div className="absolute bottom-0 right-0 opacity-[0.06] pointer-events-none">
        <Icon size={160} strokeWidth={1.2} />
      </div>

      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${a.bg}`}>
        <Icon className={a.text} size={24} strokeWidth={2.2} />
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <ArrowUpRight
          size={18}
          className="text-slate-400 group-hover:text-indigo-600 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition"
        />
      </div>
      <p className="mt-1 text-sm text-slate-500 max-w-md">{description}</p>
    </Link>
  );
}
