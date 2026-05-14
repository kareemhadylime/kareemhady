// src/app/beithady/hr/headcount/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getLiveHeadcount,
  getHcComparison,
  getHeadcountHistory,
  getMonthlyAvgHeadcount,
} from '@/lib/beithady/hr/hr-headcount-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { HeadcountGrid }       from './_components/headcount-grid';
import { HcComparison }        from './_components/hc-comparison';
import { HeadcountHistory }    from './_components/headcount-history';
import { HeadcountMonthlyAvg } from './_components/headcount-monthly-avg';

export const dynamic = 'force-dynamic';

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default async function HeadcountPage() {
  await requireBeithadyPermission('hr', 'read');

  const currentMonth = new Date().toISOString().slice(0, 7);
  const from         = defaultFrom();
  const to           = new Date().toISOString().slice(0, 10);

  const [cells, comparison, historyRows, monthlyAvg] = await Promise.all([
    getLiveHeadcount(),
    getHcComparison(),
    getHeadcountHistory({ from, to }),
    getMonthlyAvgHeadcount(currentMonth),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Headcount Report' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Headcount Report"
        subtitle="Live roster · HK & Security staffing · daily log · monthly averages"
      />
      <div className="space-y-10">
        <HeadcountGrid cells={cells} />
        <HcComparison data={comparison} />
        <HeadcountHistory initialRows={historyRows} />
        <HeadcountMonthlyAvg
          initialRows={monthlyAvg.rows}
          initialDaysRecorded={monthlyAvg.days_recorded}
        />
      </div>
    </BeithadyShell>
  );
}
