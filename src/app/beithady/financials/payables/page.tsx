import {
  buildPayablesReport,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PayablesShell } from './_components/PayablesShell';
import { parseFinPayablesState } from '../_hooks/payables-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // `state.scope` is FinScope (validated by parseFinPayablesState against
  // VALID_FIN_SCOPES). FinScope and CompanyScope share the same union shape,
  // so this cast is safe — same pattern as the Ledgers page.
  const scope = state.scope as CompanyScope;
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
