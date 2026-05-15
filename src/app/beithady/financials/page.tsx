import {
  BarChart3,
  FileText,
  Calendar,
  Users,
  Snowflake,
  Search,
  Upload,
} from 'lucide-react';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { BeithadyLauncher, type LauncherTile } from '../_components/beithady-launcher';
import { supabaseAdmin } from '@/lib/supabase';
import { nextSnapshotDue } from '@/lib/beithady/financials/cadence';
import { StatusPreStrip } from './_components/StatusPreStrip';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function loadCockpitData() {
  const sb = supabaseAdmin();

  const { data: snaps } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end, version, company_scope, status, frozen_at')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false })
    .limit(1);
  const active = snaps?.[0] ?? null;

  const { data: openVar } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('account_code, variance')
    .eq('snapshot_id', active?.id ?? '00000000-0000-0000-0000-000000000000')
    .eq('variance_status', 'open');
  const openVarRows = (openVar ?? []).filter((r) => Number(r.variance) !== 0);
  const openVariance = openVarRows.reduce((s, r) => s + Number(r.variance), 0);

  const { data: frozenAll } = await sb
    .from('bh_balance_snapshots')
    .select('period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen');
  const frozenSet = new Set((frozenAll ?? []).map((r) => r.period_end as string));
  const today = new Date().toISOString().slice(0, 10);
  const next = nextSnapshotDue(today, frozenSet);

  const { data: reminders } = await sb
    .from('bh_financials_reminders')
    .select('period_end, company_scope, first_seen_at, dismissed_until')
    .is('resolved_at', null)
    .or(`dismissed_until.is.null,dismissed_until.lt.${new Date().toISOString()}`);
  return { active, openVariance, openVarCount: openVarRows.length, next, reminders: reminders ?? [] };
}

const TILES: LauncherTile[] = [
  {
    href: '/beithady/financials/performance',
    title: 'Performance',
    description: 'P&L by period · analytic · LOB',
    icon: BarChart3,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets · liabilities · equity',
    icon: FileText,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/payables',
    title: 'Payables Aging',
    description: 'Open AP buckets by partner',
    icon: Calendar,
    accent: 'slate',
  },
  {
    href: '/beithady/financials/ledgers',
    title: 'Partner Ledgers',
    description: 'Per-partner current balance',
    icon: Users,
    accent: 'emerald',
    badge: { label: 'New', tone: 'gold' },
  },
  {
    href: '/beithady/financials/snapshots',
    title: 'Snapshots',
    description: 'Frozen opening balances · versions',
    icon: Snowflake,
    accent: 'cyan',
    badge: { label: 'New', tone: 'gold' },
  },
  {
    href: '/beithady/financials/reconciliation',
    title: 'Reconciliation',
    description: 'Variance audit · account ↔ ledger',
    icon: Search,
    accent: 'rose',
    badge: { label: 'Audit', tone: 'navy' },
  },
  {
    href: '/beithady/financials/import',
    title: 'Import',
    description: 'Upload xlsx ledgers',
    icon: Upload,
    accent: 'amber',
    badge: { label: 'New', tone: 'gold' },
  },
];

export default async function FinancialsCockpit() {
  const { active, openVariance, openVarCount, next, reminders } = await loadCockpitData();

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Financials' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Financials"
        title="Financials"
        subtitle="Snapshots · Performance · Payables · Reconciliation"
      />

      {reminders.length > 0 && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: '#fdecec',
            border: '1px solid #f1bcbc',
            color: '#9a2828',
          }}
        >
          🔴 <strong>Snapshot overdue:</strong>{' '}
          {reminders.map((r) => `${r.period_end} (${r.company_scope})`).join(', ')}.{' '}
          <a href="/beithady/financials/snapshots" className="underline ml-1">
            Start draft →
          </a>
        </div>
      )}

      <StatusPreStrip
        active={active}
        openVariance={openVariance}
        openVarCount={openVarCount}
        next={next}
      />

      <BeithadyLauncher tiles={TILES} columns={3} />
    </BeithadyShell>
  );
}
