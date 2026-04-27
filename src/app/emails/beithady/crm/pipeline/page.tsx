import Link from 'next/link';
import { ArrowRight, ArrowLeft, X, Plus, Globe2, MessageCircle, Megaphone, ChevronLeft } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listLeadsByStage, getPipelineStats, LEAD_STAGES, type LeadStage } from '@/lib/beithady/pipeline/leads';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { updateLeadStageAction, createManualLeadAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  quoted: 'Quoted',
  booked: 'Booked',
  lost: 'Lost',
};
const STAGE_COLOR: Record<LeadStage, string> = {
  new: 'bg-slate-50 dark:bg-slate-900',
  contacted: 'bg-cyan-50 dark:bg-cyan-950',
  quoted: 'bg-amber-50 dark:bg-amber-950',
  booked: 'bg-emerald-50 dark:bg-emerald-950',
  lost: 'bg-rose-50 dark:bg-rose-950',
};
const SOURCE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  website: Globe2,
  whatsapp: MessageCircle,
  ads: Megaphone,
  manual: Plus,
};

export default async function PipelinePage() {
  await requireBeithadyPermission('crm', 'read');
  const [byStage, stats] = await Promise.all([listLeadsByStage(), getPipelineStats()]);

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'CRM', href: '/emails/beithady/crm' },
      { label: 'Pipeline' },
    ]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Pipeline"
        title="Sales pipeline"
        subtitle="Website forms · WhatsApp inquiries · Ads conversions · manual leads. Move stages with the buttons on each card."
      />

      {/* Stats */}
      <section className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
        <Stat label="Total leads" value={Object.values(stats.counts).reduce((s, n) => s + n, 0)} />
        <Stat label="New (7d)" value={stats.this_week} accent="cyan" />
        <Stat label="Open" value={stats.counts.new + stats.counts.contacted + stats.counts.quoted} />
        <Stat label="Booked" value={stats.counts.booked} accent="emerald" />
        <Stat label="Lost" value={stats.counts.lost} accent="rose" />
        <Stat label="Conversion" value={`${stats.conversion_pct}%`} accent="emerald" textOnly />
      </section>

      {/* Manual lead form (collapsed by default) */}
      <details className="ix-card p-4">
        <summary className="cursor-pointer font-semibold text-sm flex items-center gap-2">
          <Plus size={14} className="text-emerald-600" />
          Add manual lead
        </summary>
        <form action={createManualLeadAction} className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <input name="full_name" placeholder="Guest name" className="ix-input" />
          <input name="email" type="email" placeholder="Email" className="ix-input" />
          <input name="phone" placeholder="Phone (E.164)" className="ix-input" />
          <input name="building_interest" placeholder="BH-26 / BH-73…" className="ix-input" />
          <input name="message" placeholder="Notes (optional)" className="ix-input lg:col-span-3" />
          <button type="submit" className="ix-btn-primary">
            <Plus size={12} /> Add
          </button>
        </form>
      </details>

      {/* Kanban */}
      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {LEAD_STAGES.map(stage => (
          <div key={stage} className={`rounded-xl border border-slate-200 dark:border-slate-700 ${STAGE_COLOR[stage]} p-3 flex flex-col gap-2 min-h-[200px]`}>
            <header className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--bh-navy)' }}>{STAGE_LABEL[stage]}</h2>
              <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
                {byStage[stage]?.length || 0}
              </span>
            </header>
            <div className="flex flex-col gap-2">
              {(byStage[stage] || []).slice(0, 30).map(lead => {
                const SourceIcon = SOURCE_ICON[lead.source] || Globe2;
                return (
                  <div key={lead.id} className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-xs space-y-1.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{lead.full_name || lead.email || lead.phone_e164 || 'Anonymous'}</div>
                        <div className="text-[10px] text-slate-500 inline-flex items-center gap-1">
                          <SourceIcon size={9} /> {lead.source}
                          {lead.building_interest && <span>· {lead.building_interest}</span>}
                        </div>
                      </div>
                      {lead.guest_id && (
                        <Link href={`/emails/beithady/crm/${lead.guest_id}`} className="ix-link text-[9px] uppercase">
                          CRM
                        </Link>
                      )}
                    </div>
                    {lead.message && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">{lead.message}</p>
                    )}
                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500">
                      <span>{fmtCairoDate(lead.created_at)}</span>
                      <div className="flex items-center gap-1">
                        {prevStage(stage) && (
                          <form action={updateLeadStageAction}>
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="stage" value={prevStage(stage)!} />
                            <button type="submit" className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700" title={`Move to ${STAGE_LABEL[prevStage(stage)!]}`}>
                              <ArrowLeft size={11} />
                            </button>
                          </form>
                        )}
                        {nextStage(stage) && nextStage(stage) !== 'lost' && (
                          <form action={updateLeadStageAction}>
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="stage" value={nextStage(stage)!} />
                            <button type="submit" className="rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900" title={`Move to ${STAGE_LABEL[nextStage(stage)!]}`}>
                              <ArrowRight size={11} />
                            </button>
                          </form>
                        )}
                        {stage !== 'lost' && stage !== 'booked' && (
                          <form action={updateLeadStageAction}>
                            <input type="hidden" name="lead_id" value={lead.id} />
                            <input type="hidden" name="stage" value="lost" />
                            <button type="submit" className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900" title="Mark lost">
                              <X size={11} />
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(byStage[stage]?.length || 0) === 0 && (
                <p className="text-[10px] text-slate-400 italic text-center py-4">empty</p>
              )}
              {(byStage[stage]?.length || 0) > 30 && (
                <p className="text-[10px] text-slate-500 text-center pt-2">+{(byStage[stage]?.length || 0) - 30} more not shown</p>
              )}
            </div>
          </div>
        ))}
      </section>

      <div className="ix-card p-4 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
        <span>Website forms POST to <code>/api/leads/beithady/inbound</code> — open intake (allowed-origins via env).</span>
        <span>Phone match auto-links to a recent <code>ads_lead</code> so Phase H attribution flows through.</span>
      </div>
    </BeithadyShell>
  );
}

function prevStage(stage: LeadStage): LeadStage | null {
  const order: LeadStage[] = ['new', 'contacted', 'quoted', 'booked'];
  const i = order.indexOf(stage);
  return i > 0 ? order[i - 1] : null;
}
function nextStage(stage: LeadStage): LeadStage | null {
  const order: LeadStage[] = ['new', 'contacted', 'quoted', 'booked'];
  const i = order.indexOf(stage);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

function Stat({ label, value, accent, textOnly }: { label: string; value: number | string; accent?: 'cyan' | 'emerald' | 'rose'; textOnly?: boolean }) {
  const cls = accent === 'cyan' ? 'text-cyan-700 dark:text-cyan-300'
    : accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300'
    : accent === 'rose' ? 'text-rose-700 dark:text-rose-300'
    : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`${textOnly ? 'text-base' : 'text-lg'} font-bold tabular-nums ${cls}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}
