import {
  buildBalanceSheet,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { BalanceSheetShell } from './_components/BalanceSheetShell';
import { parseFinBSState } from '../_hooks/bs-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string; building?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.asof) urlParams.set('asof', sp.asof);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.building) urlParams.set('building', sp.building);
  const state = parseFinBSState(urlParams);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const bs = await buildBalanceSheet({ asOf: state.asof, companyIds });

  return (
    <BalanceSheetShell
      bs={bs}
      scopeLbl={scopeLabel(scope)}
      asOf={state.asof}
    />
  );
}
