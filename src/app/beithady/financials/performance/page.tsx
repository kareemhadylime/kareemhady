import {
  buildPnlReport,
  resolveFinancePeriod,
  scopeCompanyIds,
  scopeLabel,
  type CompanyScope,
} from '@/lib/financials-pnl';
import { PerformanceShell } from './_components/PerformanceShell';
import { parseFinPerfState } from '../_hooks/use-perf-pnl-url-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isCompanyScope(s: string | undefined): s is CompanyScope {
  return s === 'consolidated' || s === 'egypt' || s === 'dubai' || s === 'a1';
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    month?: string;
    scope?: string;
    building?: string;
    lob?: string;
  }>;
}) {
  const sp = await searchParams;

  // Build a URLSearchParams to feed our typed parser. The parser is the source
  // of truth for which params we honor and how — page.tsx just glues data fetch
  // to the URL state.
  const urlParams = new URLSearchParams();
  if (sp.preset) urlParams.set('preset', sp.preset);
  if (sp.month) urlParams.set('month', sp.month);
  if (sp.scope) urlParams.set('scope', sp.scope);
  if (sp.building) urlParams.set('building', sp.building);
  if (sp.lob) urlParams.set('lob', sp.lob);
  const state = parseFinPerfState(urlParams);

  // Legacy ?from=&to= URL params still resolve via the existing helper. The
  // shell UI never emits these, but old bookmarks continue to work.
  const presetStr = state.period.kind === 'month'
    ? `month:${state.period.ym}`
    : state.period.id;
  const period = resolveFinancePeriod(presetStr, sp.from, sp.to);

  const scope: CompanyScope = isCompanyScope(state.scope) ? state.scope : 'consolidated';
  const companyIds = scopeCompanyIds(scope);
  const buildingCode = state.building !== 'all' ? state.building : undefined;
  const lobLabel = state.lob && state.lob !== 'all' ? state.lob : undefined;

  const pnl = await buildPnlReport({
    fromDate: period.fromDate,
    toDate: period.toDate,
    label: period.label,
    companyIds,
    buildingCode,
    lobLabel,
  });

  return (
    <PerformanceShell
      pnl={pnl}
      scopeLbl={scopeLabel(scope)}
      buildingCode={buildingCode}
      lobLabel={lobLabel}
      periodLabel={period.label}
    />
  );
}
