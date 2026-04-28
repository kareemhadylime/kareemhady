import Link from 'next/link';
import { CheckCircle2, Circle, Clock, AlertTriangle, User } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { completeTaskAction, snoozeTaskAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TYPE_LABELS: Record<string, string> = {
  pre_arrival_check: 'Pre-arrival check',
  csat_followup: 'CSAT follow-up',
  review_ask: 'Review request',
  manual: 'Manual',
  mid_stay_outreach: 'Mid-stay outreach',
  win_back: 'Win-back',
};
const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
  normal: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  low: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireBeithadyPermission('crm', 'read');
  const sp = await searchParams;
  const filter = sp.filter === 'all' ? 'all' : sp.filter === 'done' ? 'done' : 'open';

  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_tasks')
    .select('id, type, title, notes, due_at, status, priority, guest_id, reservation_id, building_code, assignee_user_id, created_at, completed_at, metadata')
    .order('priority', { ascending: false })
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (filter === 'open') q = q.eq('status', 'open');
  if (filter === 'done') q = q.eq('status', 'done');

  const { data: tasks } = await q;
  const rows = (tasks as Array<{
    id: string;
    type: string;
    title: string;
    notes: string | null;
    due_at: string | null;
    status: string;
    priority: string;
    guest_id: string | null;
    reservation_id: string | null;
    building_code: string | null;
    assignee_user_id: string | null;
    created_at: string;
    completed_at: string | null;
    metadata: Record<string, unknown> | null;
  }> | null) || [];

  const [openByType, urgent] = await Promise.all([
    sb.from('beithady_tasks').select('type, status').eq('status', 'open'),
    sb.from('beithady_tasks').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('priority', 'urgent'),
  ]);
  const totalOpen = (openByType.data as Array<unknown> | null)?.length || 0;

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/beithady/crm' },
      { label: 'Tasks' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Tasks"
        title="Tasks"
        subtitle="Auto-generated from CSAT follow-ups, NPS detractors, pre-arrival checks. Manual tasks too."
      />

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Open" value={totalOpen} />
        <Stat label="Urgent" value={urgent.count ?? 0} accent="rose" />
        <Stat label="Today" value={rows.filter(r => r.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length} />
        <Stat label="Filter" value={filter} accent="slate" textOnly />
      </section>

      <div className="flex items-center gap-2 text-xs">
        <Link href="?filter=open" className={`px-3 py-1 rounded ${filter === 'open' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>Open</Link>
        <Link href="?filter=done" className={`px-3 py-1 rounded ${filter === 'done' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>Done</Link>
        <Link href="?filter=all" className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-slate-700 text-white' : 'bg-stone-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>All</Link>
      </div>

      <div className="ix-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No {filter === 'open' ? 'open' : filter === 'done' ? 'completed' : ''} tasks{filter === 'open' ? ' — nice work!' : '.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map(t => (
              <li key={t.id} className="p-4 flex items-start gap-3">
                <div className="pt-0.5">
                  {t.status === 'done' ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : (
                    <Circle size={18} className="text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--bh-navy)' }}>{t.title}</span>
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.normal}`}>
                      {t.priority}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                      {TYPE_LABELS[t.type] || t.type}
                    </span>
                    {t.building_code && (
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {t.building_code}
                      </span>
                    )}
                  </div>
                  {t.notes && <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{t.notes}</p>}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                    {t.due_at && <span className="inline-flex items-center gap-1"><Clock size={11} /> Due {fmtCairoDateTime(t.due_at)}</span>}
                    {t.guest_id && (
                      <Link href={`/beithady/crm/${t.guest_id}`} className="inline-flex items-center gap-1 hover:underline">
                        <User size={11} /> Guest
                      </Link>
                    )}
                    {t.metadata && (t.metadata as { nps?: number }).nps !== undefined && (
                      <span className="inline-flex items-center gap-1 text-rose-600">
                        <AlertTriangle size={11} /> NPS {(t.metadata as { nps: number }).nps}/10
                      </span>
                    )}
                  </div>
                </div>
                {t.status === 'open' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <form action={completeTaskAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <button type="submit" className="ix-btn-primary text-xs">
                        <CheckCircle2 size={12} /> Done
                      </button>
                    </form>
                    <form action={snoozeTaskAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <button type="submit" className="ix-btn-secondary text-xs">
                        <Clock size={12} /> Snooze 24h
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-500 text-center">
        Auto-tasks fire from CSAT detractors (NPS &lt; 8 → high/urgent priority + 24h due).
      </p>
    </BeithadyShell>
  );
}

function Stat({ label, value, accent, textOnly }: { label: string; value: number | string; accent?: 'rose' | 'slate'; textOnly?: boolean }) {
  const cls = accent === 'rose'
    ? 'text-rose-700 dark:text-rose-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`${textOnly ? 'text-sm' : 'text-lg'} font-bold tabular-nums ${cls}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}
