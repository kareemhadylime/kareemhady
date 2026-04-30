import { requireBeithadyPermission, hasBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { templateConfig, type TemplateKey } from '@/lib/beithady/reports/templates';
import { ReportBuilder } from './_components/ReportBuilder';
import type { ReportConfig } from '@/lib/beithady/reports/types';
import { rollingDays } from '@/lib/beithady/reports/period-resolver';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_TEMPLATES: TemplateKey[] = [
  'bh_yearly',
  'bcg_2wk',
  'per_listing',
  'building_h2h',
  'channel_mix',
  'pricing_vs_market',
];

function defaultConfig(): ReportConfig {
  return {
    title: 'Untitled report',
    description: '',
    template_key: null,
    periods: [rollingDays(30)],
    groupBy: { primary: 'building' },
    metrics: ['occupancy_pct', 'adr_usd', 'total_revenue_usd', 'reservations_count'],
    filters: { includeCancelled: false },
    visualization: {
      showKpiStrip: true,
      showPivotTable: true,
      charts: [
        {
          id: 'c1',
          type: 'grouped_bar',
          metricKey: 'occupancy_pct',
          title: 'Occupancy by group',
        },
      ],
    },
    enableAiCommentary: true,
    enableAnomalyDetection: true,
  };
}

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; from?: string }>;
}) {
  const { user } = await requireBeithadyPermission('analytics', 'read');
  const canSave = await hasBeithadyPermission(user, 'analytics', 'full');
  const sp = await searchParams;

  let initial: ReportConfig = defaultConfig();
  if (sp.template && (VALID_TEMPLATES as string[]).includes(sp.template)) {
    initial = templateConfig(sp.template as TemplateKey);
  }

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Generate Report', href: '/beithady/analytics/reports' },
        { label: 'Builder' },
      ]}
      containerClass="max-w-[1400px]"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Report Builder"
        subtitle="Configure periods, group-by, metrics, and visualizations on the left. Live preview updates as you change settings."
      />

      <ReportBuilder initialConfig={initial} canSave={canSave} />
    </BeithadyShell>
  );
}
