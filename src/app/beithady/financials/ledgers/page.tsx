import { buildLedgerReport } from '@/lib/beithady/financials/ledgers';
import type { CompanyScope, PartnerKind } from '@/lib/beithady/financials/types';
import { LedgersShell } from './_components/LedgersShell';
import { parseFinLedgersState } from '../_hooks/ledgers-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SCOPE_LABEL: Record<CompanyScope, string> = {
  consolidated: 'Consolidated',
  egypt: 'Egypt',
  dubai: 'Dubai',
  a1: 'A1',
};

export default async function LedgersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; scope?: string; asof?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.kind) urlParams.set('kind', sp.kind);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.asof) urlParams.set('asof', sp.asof);
  const state = parseFinLedgersState(urlParams);

  // buildLedgerReport accepts PartnerKind | 'all' — same as our state.kind.
  // The cast is safe because parseFinLedgersState already validated against
  // VALID_KINDS, which mirrors the LedgerKind union exactly.
  const dataKind = state.kind as PartnerKind | 'all';
  const dataScope = state.scope as CompanyScope;

  const report = await buildLedgerReport({
    kind: dataKind,
    scope: dataScope,
    as_of: state.asof,
  });

  return (
    <LedgersShell
      report={report}
      scope={state.scope}
      kind={state.kind}
      asOf={state.asof}
      scopeLbl={SCOPE_LABEL[dataScope]}
    />
  );
}
