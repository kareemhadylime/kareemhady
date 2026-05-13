import { AlertTriangle, CheckCircle2, Clock, XCircle, CreditCard, HelpCircle, FileText } from 'lucide-react';
import type { MetaLiveStatus } from '@/lib/beithady/ads/meta-client';

// Live Meta delivery status indicator. Shows what Meta actually thinks
// (effective_status) which can diverge from our DB's manual status:
// - DB says ACTIVE + Meta says IN_REVIEW → ad isn't running yet, waiting for review
// - DB says ACTIVE + Meta says DISAPPROVED → blocked, see issues_info for reason
// - DB says ACTIVE + Meta says PENDING_BILLING_INFO → ad account billing problem

const PRESETS: Record<
  string,
  { label: string; cls: string; icon: typeof CheckCircle2; hint?: string }
> = {
  ACTIVE: {
    label: 'Delivering',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
  },
  IN_REVIEW: {
    label: 'In review',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    icon: Clock,
    hint: 'Meta typically takes 15 min–24 h to review.',
  },
  PENDING_REVIEW: {
    label: 'Pending review',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800',
    icon: Clock,
  },
  WITH_ISSUES: {
    label: 'Issues',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800',
    icon: AlertTriangle,
  },
  DISAPPROVED: {
    label: 'Disapproved',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800',
    icon: XCircle,
    hint: 'Meta rejected this — see reason below.',
  },
  PENDING_BILLING_INFO: {
    label: 'Billing required',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 border-rose-200 dark:border-rose-800',
    icon: CreditCard,
    hint: 'Ad account has no valid payment method.',
  },
  CAMPAIGN_PAUSED: {
    label: 'Campaign paused',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
    icon: Clock,
  },
  ADSET_PAUSED: {
    label: 'Ad set paused',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
    icon: Clock,
  },
  PAUSED: {
    label: 'Paused',
    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
    icon: Clock,
  },
  PREAPPROVED: {
    label: 'Pre-approved',
    cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200 border-sky-200 dark:border-sky-800',
    icon: CheckCircle2,
  },
  DELETED: {
    label: 'Deleted',
    cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    icon: XCircle,
  },
  ARCHIVED: {
    label: 'Archived',
    cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    icon: FileText,
  },
  DRAFT: {
    label: 'Draft (local)',
    cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    icon: FileText,
  },
  UNKNOWN: {
    label: 'Meta unreachable',
    cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
    icon: HelpCircle,
  },
};

export function MetaStatusBadge({ status }: { status: MetaLiveStatus | null }) {
  if (!status) {
    return (
      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-200 inline-flex items-center gap-1">
        <HelpCircle size={10} /> No live data
      </span>
    );
  }
  const preset = PRESETS[status.effective_status] ?? PRESETS.UNKNOWN;
  const Icon = preset.icon;
  return (
    <span
      className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${preset.cls}`}
      title={preset.hint || preset.label}
    >
      <Icon size={10} />
      {preset.label}
    </span>
  );
}

export function MetaIssuesList({ status }: { status: MetaLiveStatus | null }) {
  if (!status?.issues_info?.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {status.issues_info.map((issue, i) => (
        <div
          key={i}
          className="text-[11px] border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 rounded p-2 flex items-start gap-1.5"
        >
          <AlertTriangle size={11} className="text-rose-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-rose-800 dark:text-rose-200">
              {issue.error_summary}
            </div>
            {issue.error_message && (
              <div className="text-rose-700 dark:text-rose-300 mt-0.5">{issue.error_message}</div>
            )}
            <div className="text-[10px] text-rose-500 mt-0.5">
              code {issue.error_code} · {issue.level} · {issue.error_type}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
