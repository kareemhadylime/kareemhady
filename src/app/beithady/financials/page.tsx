import Link from 'next/link';
import {
  ChevronRight,
  BarChart3,
  FileText,
  Calendar,
  Users,
  Snowflake,
  Search,
  Upload,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { supabaseAdmin } from '@/lib/supabase';
import { CockpitTile } from './_components/CockpitTile';
import { nextSnapshotDue } from '@/lib/beithady/financials/cadence';

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

export default async function FinancialsCockpit() {
  const { active, openVariance, openVarCount, next, reminders } = await loadCockpitData();

  return (
    <>
      <TopNav>
        <Link href="/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Financials</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 flex-1">
        <h1 className="text-2xl font-bold mb-6">Financials · Beithady</h1>

        {reminders.length > 0 ? (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm">
            🔴 <strong>Snapshot overdue:</strong>{' '}
            {reminders.map((r) => `${r.period_end} (${r.company_scope})`).join(', ')}.{' '}
            <a href="/beithady/financials/snapshots" className="underline ml-1">
              Start draft →
            </a>
          </div>
        ) : null}

        {/* Status row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 mb-1">
              Active snapshot
            </div>
            <div className="text-base font-semibold">
              {active
                ? `${active.period_end} v${active.version}`
                : 'No frozen snapshot'}
            </div>
            <div className="text-xs text-slate-500">
              {active?.frozen_at
                ? `Consolidated · frozen ${(active.frozen_at as string).slice(0, 10)}`
                : '—'}
            </div>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700 mb-1">
              Open variance
            </div>
            <div className="text-base font-semibold">
              {Math.round(openVariance).toLocaleString('en-US')} EGP
            </div>
            <div className="text-xs text-slate-500">
              {openVarCount} account{openVarCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-yellow-700 mb-1">
              Next snapshot due
            </div>
            <div className="text-base font-semibold">
              {next ? next.period_end : 'All current'}
            </div>
            <div className="text-xs text-slate-500">
              {next
                ? `${next.is_overdue ? 'Overdue · ' : ''}due by ${next.due_by}`
                : '—'}
            </div>
          </div>
        </div>

        {/* Tile grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CockpitTile
            href="/beithady/financials/performance"
            icon={BarChart3}
            title="Performance"
            description="P&L by period · analytic · LOB"
          />
          <CockpitTile
            href="/beithady/financials/balance-sheet"
            icon={FileText}
            title="Balance Sheet"
            description="Assets · liabilities · equity"
          />
          <CockpitTile
            href="/beithady/financials/payables"
            icon={Calendar}
            title="Payables Aging"
            description="Open AP buckets by partner"
          />
          <CockpitTile
            href="/beithady/financials/ledgers"
            icon={Users}
            title="Partner Ledgers"
            description="Per-partner current balance"
            badge="NEW"
            variant="new"
          />
          <CockpitTile
            href="/beithady/financials/snapshots"
            icon={Snowflake}
            title="Snapshots"
            description="Frozen opening balances · versions"
            badge="NEW"
            variant="new"
          />
          <CockpitTile
            href="/beithady/financials/reconciliation"
            icon={Search}
            title="Reconciliation"
            description="Variance audit · account ↔ ledger"
            badge="AUDIT"
            variant="audit"
          />
          <CockpitTile
            href="/beithady/financials/import"
            icon={Upload}
            title="Import"
            description="Upload xlsx ledgers"
            badge="NEW"
            variant="new"
          />
        </div>
      </main>
    </>
  );
}
