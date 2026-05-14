import type { EmployeeStatus } from '@/lib/beithady/hr/hr-types';
import { STATUS_LABELS } from '@/lib/beithady/hr/hr-types';

const STATUS_STYLES: Record<EmployeeStatus, string> = {
  on_job:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  probation:  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  on_leave:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  suspended:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  terminated: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
