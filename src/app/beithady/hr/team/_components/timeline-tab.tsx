'use client';

import { UserPlus, TrendingUp, Building2, DollarSign, UserX, RefreshCw } from 'lucide-react';
import type { HrEvent, EventType } from '@/lib/beithady/hr/hr-types';

const EVENT_CONFIG: Record<EventType, { icon: React.ElementType; color: string; label: string }> = {
  hired:             { icon: UserPlus,    color: 'text-emerald-500', label: 'Hired' },
  status_change:     { icon: RefreshCw,   color: 'text-blue-500',    label: 'Status Changed' },
  salary_change:     { icon: DollarSign,  color: 'text-amber-500',   label: 'Salary Updated' },
  building_transfer: { icon: Building2,   color: 'text-violet-500',  label: 'Transferred' },
  role_change:       { icon: TrendingUp,  color: 'text-cyan-500',    label: 'Role Changed' },
  terminated:        { icon: UserX,       color: 'text-red-500',     label: 'Terminated' },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function TimelineTab({ events }: { events: HrEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        No timeline events yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-3 space-y-6">
      {events.map(ev => {
        const cfg = EVENT_CONFIG[ev.event_type];
        const Icon = cfg.icon;
        return (
          <li key={ev.id} className="ml-6">
            <span className="absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full bg-white dark:bg-slate-900 ring-2 ring-slate-200 dark:ring-slate-700">
              <Icon size={12} className={cfg.color} />
            </span>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {cfg.label}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">
                  {ev.description}
                </p>
              </div>
              <time className="text-xs text-slate-400 whitespace-nowrap">
                {fmt(ev.event_date)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
