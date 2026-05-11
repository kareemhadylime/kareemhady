import Link from 'next/link';
import { FlaskConical, Trophy, ChevronRight } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function createExperimentAction(formData: FormData): Promise<void> {
  'use server';
  const user = await getCurrentUser();
  if (!user || !(user.is_admin || await hasBeithadyPermission(user, 'ads', 'full'))) throw new Error('forbidden');
  const name = String(formData.get('name') || '').trim();
  const hypothesis = String(formData.get('hypothesis') || '').trim() || null;
  const platform = String(formData.get('platform') || 'meta');
  const controlId = Number.parseInt(String(formData.get('control_campaign_id') || ''), 10);
  const variantIdsRaw = String(formData.get('variant_campaign_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const variantIds = variantIdsRaw.map(Number).filter(Number.isFinite);
  if (!name || !Number.isFinite(controlId) || variantIds.length === 0) {
    redirect('/beithady/ads/experiments?error=missing_required');
  }
  const sb = supabaseAdmin();
  await sb.from('ads_experiments').insert({
    name,
    hypothesis,
    platform,
    control_campaign_id: controlId,
    variant_campaign_ids: variantIds,
    status: 'running',
    started_at: new Date().toISOString(),
    created_by: user.username,
  });
  revalidatePath('/beithady/ads/experiments');
  redirect('/beithady/ads/experiments?created=1');
}

async function declareWinnerAction(formData: FormData): Promise<void> {
  'use server';
  const user = await getCurrentUser();
  if (!user || !(user.is_admin || await hasBeithadyPermission(user, 'ads', 'full'))) throw new Error('forbidden');
  const expId = Number.parseInt(String(formData.get('experiment_id') || ''), 10);
  const winnerId = Number.parseInt(String(formData.get('winner_campaign_id') || ''), 10);
  if (!Number.isFinite(expId) || !Number.isFinite(winnerId)) return;
  const sb = supabaseAdmin();
  await sb.from('ads_experiments').update({
    status: 'completed',
    ended_at: new Date().toISOString(),
    winner_campaign_id: winnerId,
  }).eq('id', expId);
  revalidatePath('/beithady/ads/experiments');
}

type ExperimentRow = {
  experiment_id: number;
  experiment_name: string;
  platform: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  control_campaign_id: number | null;
  control_name: string | null;
  control_spend: number | null;
  control_leads: number | null;
  control_clicks: number | null;
  control_impressions: number | null;
  control_cpl: number | null;
  control_ctr_pct: number | null;
  variant_count: number;
  variant_spend: number | null;
  variant_leads: number | null;
  variant_clicks: number | null;
  variant_impressions: number | null;
};

export default async function ExperimentsPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string }> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const sb = supabaseAdmin();
  const [{ data: experimentsRaw }, { data: campaignsRaw }] = await Promise.all([
    sb.from('ads_experiment_results').select('*').order('started_at', { ascending: false, nullsFirst: false }),
    sb.from('ads_campaigns').select('id, name, platform, status').order('created_at', { ascending: false }).limit(100),
  ]);
  const experiments = (experimentsRaw as ExperimentRow[] | null) || [];
  const campaigns = (campaignsRaw as Array<{ id: number; name: string; platform: string; status: string | null }> | null) || [];

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Experiments' }]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="A/B experiments"
        subtitle="Pit two or more campaigns against each other for the same audience + budget. Pick the winner; archive the losers."
      />

      <AdsTabs active="campaigns" />

      {sp.created && <div className="ix-card border-emerald-200 bg-emerald-50 p-3 text-sm">Experiment created — running now.</div>}
      {sp.error && <div className="ix-card border-rose-200 bg-rose-50 p-3 text-sm font-mono">{sp.error}</div>}

      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><FlaskConical size={14} /> Running + completed</h2>
        {experiments.length === 0 ? (
          <p className="text-xs text-slate-500">No experiments yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Control</th>
                <th className="py-2 pr-3">Variants</th>
                <th className="py-2 pr-3 text-right">Spend (C / V)</th>
                <th className="py-2 pr-3 text-right">Leads (C / V)</th>
                <th className="py-2 pr-3 text-right">CPL (C / V)</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map(e => {
                const controlSpend = Number(e.control_spend) || 0;
                const variantSpend = Number(e.variant_spend) || 0;
                const controlLeads = Number(e.control_leads) || 0;
                const variantLeads = Number(e.variant_leads) || 0;
                const controlCpl = controlLeads > 0 ? controlSpend / controlLeads : null;
                const variantCpl = variantLeads > 0 ? variantSpend / variantLeads : null;
                const winner = controlCpl != null && variantCpl != null
                  ? (controlCpl < variantCpl ? 'control' : 'variant')
                  : null;
                return (
                  <tr key={e.experiment_id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                    <td className="py-2 pr-3 font-medium">{e.experiment_name}</td>
                    <td className="py-2 pr-3">{PLATFORM_LABEL[e.platform as keyof typeof PLATFORM_LABEL] || e.platform}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${
                        e.status === 'running' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200' :
                        e.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>{e.status}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {e.control_campaign_id && (
                        <Link href={`/beithady/ads/campaigns/${e.control_campaign_id}`} className="ix-link">
                          {e.control_name || `#${e.control_campaign_id}`}
                        </Link>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[11px]">{e.variant_count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">${Math.round(controlSpend)} / ${Math.round(variantSpend)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{controlLeads} / {variantLeads}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {controlCpl == null ? '—' : `$${controlCpl.toFixed(2)}`} {' / '}
                      {variantCpl == null ? '—' : `$${variantCpl.toFixed(2)}`}
                      {winner && (
                        <div className={`text-[9px] font-semibold uppercase mt-0.5 ${winner === 'control' ? 'text-cyan-600' : 'text-emerald-600'}`}>
                          <Trophy size={9} className="inline mr-0.5" /> {winner} winning
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {e.status === 'running' && winner && e.control_campaign_id && (
                        <form action={declareWinnerAction} className="inline">
                          <input type="hidden" name="experiment_id" value={e.experiment_id} />
                          <input type="hidden" name="winner_campaign_id" value={e.control_campaign_id} />
                          <button type="submit" className="ix-link text-[11px]">Declare winner <ChevronRight size={9} className="inline" /></button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="ix-card p-5 space-y-3 text-sm">
        <h2 className="font-semibold">Create experiment</h2>
        <form action={createExperimentAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold">Name</label>
            <input name="name" required className="ix-input" placeholder="Carousel vs single — BH-435 / Eid" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Platform</label>
            <select name="platform" className="ix-input">
              <option value="meta">Meta</option>
              <option value="google">Google</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold">Hypothesis (optional)</label>
            <input name="hypothesis" className="ix-input" placeholder="Carousel will get 30% better CPL than single image for Eid traffic" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Control campaign</label>
            <select name="control_campaign_id" required className="ix-input">
              <option value="">— pick one —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>[{c.platform}] {c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold">Variant campaign IDs (comma-separated)</label>
            <input name="variant_campaign_ids" className="ix-input font-mono text-xs" placeholder="32, 33" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="ix-btn-primary">Start experiment</button>
          </div>
        </form>
        <p className="text-[11px] text-slate-500">
          Create the two (or more) candidate campaigns first via the publish wizards, then pair them here. Both must use the same audience + budget for the test to be meaningful.
        </p>
      </section>
    </BeithadyShell>
  );
}
