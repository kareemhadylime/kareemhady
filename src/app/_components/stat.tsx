import type { LucideIcon } from 'lucide-react';

export function Stat({
  label,
  value,
  hint,
  Icon,
  accent = 'indigo',
}: {
  label: string;
  value: string | number;
  hint?: string;
  Icon?: LucideIcon;
  accent?: 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose';
}) {
  const tint = {
    indigo: 'text-indigo-600 bg-indigo-50',
    violet: 'text-violet-600 bg-violet-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    amber: 'text-amber-600 bg-amber-50',
    rose: 'text-rose-600 bg-rose-50',
  }[accent];
  return (
    <div className="ix-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </div>
          <div className="text-3xl font-bold mt-1 tracking-tight">{value}</div>
          {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
        {Icon && (
          <div className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg ${tint}`}>
            <Icon size={20} strokeWidth={2.2} />
          </div>
        )}
      </div>
    </div>
  );
}
