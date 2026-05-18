import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { FmplusHero } from '../../_components/fmplus-hero';
import { supabaseAdmin } from '@/lib/supabase';
import { getShiftReportConfig, listShiftReports } from '@/lib/fmplus/shift-report/actions';
import { ShiftReportModule } from './_components/shift-report-module';
import { defaultVerticalConfig } from '@/lib/fmplus/shift-report/types';

export const dynamic = 'force-dynamic';

export default async function ShiftReportContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId: contractIdStr } = await params;
  const contractId = Number(contractIdStr);
  if (!Number.isFinite(contractId)) notFound();

  const sb = supabaseAdmin();
  const { data: contract } = await sb
    .from('project_contracts')
    .select('id, name, customer')
    .eq('id', contractId)
    .maybeSingle();

  if (!contract) notFound();

  const [cfgRow, history] = await Promise.all([
    getShiftReportConfig(contractId),
    listShiftReports(contractId, 30),
  ]);

  const initialConfig = {
    contractNumber: cfgRow?.contract_number ?? '',
    waGroup:        cfgRow?.wa_group ?? '',
    verticals:      (cfgRow?.verticals && Object.keys(cfgRow.verticals).length > 0)
      ? cfgRow.verticals
      : defaultVerticalConfig(),
  };

  return (
    <>
      <TopNav>
        <Link href="/fmplus" className="hover:text-fmplus-gold">FMPLUS</Link>
        <span className="text-slate-400">/</span>
        <Link href="/fmplus/shift-report" className="hover:text-fmplus-gold">Shift Reports</Link>
        <span className="text-slate-400">/</span>
        <span className="truncate max-w-[200px]">{contract.name}</span>
      </TopNav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1">
        <FmplusHero
          eyebrow={`FMPLUS · OPERATIONS · ${(contract.customer ?? '').toUpperCase()}`}
          title={contract.name}
          subtitle="تقرير الوردية اليومي — Daily shift report covering today&apos;s morning shift and yesterday&apos;s morning &amp; night shifts."
          icon={ClipboardList}
          showLogo={false}
        />
        <ShiftReportModule
          contractId={contractId}
          projectName={contract.name}
          initialConfig={initialConfig}
          initialHistory={history}
        />
      </main>
    </>
  );
}
