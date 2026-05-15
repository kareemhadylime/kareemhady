import Link from 'next/link';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { buildReconciliation } from '@/lib/beithady/financials/reconciliation';
import { supabaseAdmin } from '@/lib/supabase';
import { ReconciliationShell } from './_components/ReconciliationShell';
import { parseFinReconciliationState } from '../_hooks/use-reconciliation-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.snapshot) urlParams.set('snapshot', sp.snapshot);
  const state = parseFinReconciliationState(urlParams);

  const sb = supabaseAdmin();

  // Fetch all frozen consolidated snapshots for the rail picker.
  const { data: allSnaps } = await sb
    .from('bh_balance_snapshots')
    .select('id, period_end, version')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen')
    .order('period_end', { ascending: false });

  const snapshotOptions = (allSnaps ?? []).map((s) => ({
    id: s.id as string,
    label: `${s.period_end} v${s.version}`,
  }));

  // Resolve snapshot: explicit URL → use it; else latest frozen.
  const snapshotId = state.snapshot_id ?? snapshotOptions[0]?.id;

  if (!snapshotId) {
    return (
      <BeithadyShell breadcrumbs={[{ label: 'Financials', href: '/beithady/financials' }, { label: 'Reconciliation' }]}>
        <BeithadyHeader
          eyebrow="Beit Hady · Financials"
          title="Reconciliation"
          subtitle="No frozen snapshot found"
        />
        <p className="text-sm" style={{ color: 'var(--bh-steel)' }}>
          No frozen snapshot found.{' '}
          <Link href="/beithady/financials/import" className="underline">
            Import a ledger
          </Link>{' '}
          to create one.
        </p>
      </BeithadyShell>
    );
  }

  const report = await buildReconciliation({ snapshot_id: snapshotId });

  return (
    <ReconciliationShell
      report={report}
      snapshotId={snapshotId}
      snapshotOptions={snapshotOptions}
    />
  );
}
