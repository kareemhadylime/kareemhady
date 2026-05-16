import Link from 'next/link';
import { ShieldAlert, Pause, Play } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCampaigns, listCampaignBudgetStates } from '@/lib/beithady/ads/reporting';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AdsTabs } from '../_components/ads-tabs';
import { statusBadgeClass, PLATFORM_LABEL } from '@/lib/beithady/ads/platforms';
import { setCampaignStatusActionUnified } from '../actions';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, fetchMetaEntityStatusBatch } from '@/lib/beithady/ads/meta-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function CampaignsListPage({ searchParams }: { searchParams: Promise<{ platform?: string; status?: string }> }) {
  await requireBeithadyPermission('ads', 'read');
  const sp = await searchParams;
  const [all, budgetStates] = await Promise.all([listCampaigns(), listCampaignBudgetStates()]);

  // ── Auto-sync Meta campaign statuses ──────────────────────────────────────
  // Fetch live effective_status for all active Meta campaigns and patch the DB
  // when they diverge (e.g. user paused/deleted a campaign directly in Meta).
  // Runs in parallel with the filter/render logic below; any updated statuses
  // are reflected immediately because we mutate the `all` array in-place.
  try {
    const sb = supabaseAdmin();
    const creds = await loadMetaCredentials();
    if (creds.ok) {
      const { data: metaRows } = await sb
        .from('ads_campaigns')
        .select('id, external_id, status')
        .eq('platform', 'meta')
        .not('external_id', 'like', 'draft_%')
        .in('status', ['ACTIVE', 'PAUSED']);
      if (metaRows?.length) {
        const extIds = metaRows.map(r => (r as { id: number; external_id: string; status: string }).external_id);
        const liveMap = await fetchMetaEntityStatusBatch(extIds, creds.creds.token);
        const SYNCABLE = new Set(['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']);
        await Promise.all(
          metaRows.map(async raw => {
            const r = raw as { id: number; external_id: string; status: string };
            const live = liveMap.get(r.external_id);
            if (!live || live.error || live.not_found) return;
            const liveStatus = live.effective_status.toUpperCase();
            if (SYNCABLE.has(liveStatus) && liveStatus !== r.status.toUpperCase()) {
              await sb.from('ads_campaigns').update({ status: liveStatus }).eq('id', r.id);
              // Patch in-memory so the render below sees the corrected value immediately
              const row = all.find(c => c.campaign_id === r.id);
              if (row) row.campaign_status = liveStatus;
            }
          })
        );
      }
    }
  } catch {
    // Non-fatal — best-effort sync; page renders with DB data if Meta is down
  }
  const budgetByCampaign = new Map(budgetStates.map(b => [b.campaign_id, b]));
  const filtered = all.filter(c => {
    if (sp.platform && c.platform !== sp.platform) return false;
    if (sp.status && (c.campaign_status || '').toUpperCase() !== sp.status.toUpperCase()) return false;
    return true;
  });

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Ads', href: '/beithady/ads' }, { label: 'Campaigns' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Ads"
        title="Campaigns"
        subtitle="Cross-platform campaign list. Click into a row for ad sets, ads, and daily metrics."
        right={
          <Link href="/api/beithady/ads/export?dataset=campaigns" className="ix-btn-secondary text-xs" prefetch={false}>
            Download CSV
          </Link>
        }
      />

      <AdsTabs active="campaigns" />

      <section className="ix-card p-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">Filter</span>
        <FilterChip label="All platforms" href="/beithady/ads/campaigns" active={!sp.platform} />
        <FilterChip label="Meta" href="/beithady/ads/campaigns?platform=meta" active={sp.platform === 'meta'} />
        <FilterChip label="Google" href="/beithady/ads/campaigns?platform=google" active={sp.platform === 'google'} />
        <FilterChip label="TikTok" href="/beithady/ads/campaigns?platform=tiktok" active={sp.platform === 'tiktok'} />
        <span className="mx-2 text-slate-300">|</span>
        <FilterChip label="All status" href={`/beithady/ads/campaigns${sp.platform ? `?platform=${sp.platform}` : ''}`} active={!sp.status} />
        <FilterChip label="Active" href={`/beithady/ads/campaigns?status=ACTIVE${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'ACTIVE'} />
        <FilterChip label="Paused" href={`/beithady/ads/campaigns?status=PAUSED${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'PAUSED'} />
        <FilterChip label="Draft" href={`/beithady/ads/campaigns?status=DRAFT${sp.platform ? `&platform=${sp.platform}` : ''}`} active={sp.status === 'DRAFT'} />
      </section>

      <section className="ix-card p-5">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No campaigns match these filters.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Buildings</th>
                <th className="py-2 pr-3 text-right">Spend</th>
                <th className="py-2 pr-3 text-right">Clicks</th>
                <th className="py-2 pr-3 text-right">Leads</th>
                <th className="py-2 pr-3 text-right">CPL</th>
                <th className="py-2 pr-3 text-right">CTR</th>
                <th className="py-2 pr-3 text-right">Cap</th>
                <th className="py-2 pr-3">Last day</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const budget = budgetByCampaign.get(c.campaign_id);
                const cap = budget?.monthly_budget_cap_usd;
                const autoPaused = !!budget?.auto_paused_at;
                const pctUsed = cap && cap > 0 ? (c.spend / cap) * 100 : null;
                return (
                  <tr key={c.campaign_id} className="border-b border-slate-100 dark:border-slate-800 align-middle">
                    <td className="py-2 pr-3">
                      <Link href={`/beithady/ads/campaigns/${c.campaign_id}`} className="ix-link font-medium">{c.campaign_name}</Link>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        {c.objective || '—'}
                        {autoPaused && (
                          <span title={budget?.auto_paused_reason || 'auto-paused'} className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200 font-semibold">
                            <ShieldAlert size={8} /> auto-pause
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{PLATFORM_LABEL[c.platform as keyof typeof PLATFORM_LABEL] || c.platform}</td>
                    <td className="py-2 pr-3"><span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(c.campaign_status)}`}>{c.campaign_status || '—'}</span></td>
                    <td className="py-2 pr-3 text-[11px]">{(c.building_codes || []).join(' · ') || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">EGP {Math.round(c.spend).toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.clicks.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.leads.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.cpl == null ? '—' : `EGP ${c.cpl.toFixed(2)}`}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.ctr_pct == null ? '—' : `${c.ctr_pct.toFixed(2)}%`}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {cap == null ? '—' : (
                        <>
                          EGP {cap.toLocaleString()}
                          {pctUsed != null && (
                            <div className={`text-[9px] ${pctUsed >= 100 ? 'text-rose-600' : pctUsed >= 80 ? 'text-amber-600' : 'text-slate-400'}`}>
                              {pctUsed.toFixed(0)}% used
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-[11px] text-slate-500">{c.last_date || '—'}</td>
                    <td className="py-2 pr-3">
                      {((c.campaign_status || '').toUpperCase() === 'ACTIVE' || (c.campaign_status || '').toUpperCase() === 'PAUSED') && (
                        <form action={setCampaignStatusActionUnified} className="inline">
                          <input type="hidden" name="campaign_id" value={c.campaign_id} />
                          <input type="hidden" name="status" value={(c.campaign_status || '').toUpperCase() === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'} />
                          <button type="submit" title={(c.campaign_status || '').toUpperCase() === 'ACTIVE' ? 'Pause' : 'Activate'} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                            {(c.campaign_status || '').toUpperCase() === 'ACTIVE' ? <Pause size={12} /> : <Play size={12} />}
                          </button>
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
    </BeithadyShell>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-2 py-0.5 rounded ${active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {label}
    </Link>
  );
}
