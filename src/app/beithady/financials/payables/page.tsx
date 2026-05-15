import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PayablesShell } from './_components/PayablesShell';
import { parseFinPayablesState } from '../_hooks/use-payables-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const urlParams = new URLSearchParams();
  if (sp.asof) urlParams.set('asof', sp.asof);
  if (sp.scope) urlParams.set('scope', sp.scope);
  const state = parseFinPayablesState(urlParams);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const payables = await buildPayablesReport({ asOf: state.asof, companyIds });

  return (
    <PayablesShell
      payables={payables}
      scope={scope}
      asOf={state.asof}
      scopeLbl={scopeLabel(scope)}
    />
  );
}
