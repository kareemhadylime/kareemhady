import { supabaseAdmin } from './supabase';

// Helper for "last synced N min/hours/days ago" pills shown on every
// dashboard. Centralizes the freshness lookup + thresholds so every
// page uses the same staleness rules.

export type SyncFreshness = {
  source: string;
  last_synced_at: string | null;
  age_hours: number | null;
  status: 'fresh' | 'stale' | 'very_stale' | 'never';
  label: string;           // 'synced 2h ago' / 'stale · 2d ago' / 'never synced'
};

// Thresholds (hours): < FRESH = green, < STALE = amber, >= STALE = red.
const FRESH_HOURS = 26;    // daily cron fires at 04:xx UTC, so up to ~26h gap is normal
const STALE_HOURS = 50;    // skipped 1 day

type TableSpec = {
  source: string;
  table: string;
  statusCol?: string;
  succeededValue?: string;
};

const SPECS: Record<string, TableSpec> = {
  odoo: { source: 'Odoo', table: 'odoo_sync_runs', statusCol: 'status', succeededValue: 'succeeded' },
  guesty: { source: 'Guesty', table: 'guesty_sync_runs', statusCol: 'status', succeededValue: 'succeeded' },
  pricelabs: { source: 'PriceLabs', table: 'pricelabs_sync_runs', statusCol: 'status', succeededValue: 'succeeded' },
  shopify: { source: 'Shopify', table: 'shopify_sync_runs', statusCol: 'status', succeededValue: 'succeeded' },
};

export async function getSyncFreshness(
  sources: Array<keyof typeof SPECS>
): Promise<SyncFreshness[]> {
  const sb = supabaseAdmin();
  const out: SyncFreshness[] = [];
  for (const key of sources) {
    const spec = SPECS[key];
    if (!spec) continue;
    try {
      const { data } = await sb
        .from(spec.table)
        .select('finished_at')
        .eq(spec.statusCol || 'status', spec.succeededValue || 'succeeded')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const finishedAt =
        (data as { finished_at: string | null } | null)?.finished_at || null;
      out.push(buildPill(spec.source, finishedAt));
    } catch {
      out.push({
        source: spec.source,
        last_synced_at: null,
        age_hours: null,
        status: 'never',
        label: 'never synced',
      });
    }
  }
  return out;
}

function buildPill(source: string, iso: string | null): SyncFreshness {
  if (!iso) {
    return { source, last_synced_at: null, age_hours: null, status: 'never', label: 'never synced' };
  }
  const ageMs = Date.now() - new Date(iso).getTime();
  const ageHours = ageMs / 3_600_000;
  const status: SyncFreshness['status'] =
    ageHours < FRESH_HOURS ? 'fresh' : ageHours < STALE_HOURS ? 'stale' : 'very_stale';
  return {
    source,
    last_synced_at: iso,
    age_hours: ageHours,
    status,
    label: formatAge(ageHours, status),
  };
}

function formatAge(h: number, status: SyncFreshness['status']): string {
  let core: string;
  if (h < 1) core = `${Math.round(h * 60)}m ago`;
  else if (h < 48) core = `${Math.round(h)}h ago`;
  else core = `${Math.round(h / 24)}d ago`;
  return status === 'fresh' ? `synced ${core}` : `stale · ${core}`;
}
