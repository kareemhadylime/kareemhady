import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, FileSpreadsheet, Calendar, Edit, Play } from 'lucide-react';
import { requireBeithadyPermission, hasBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';
import { ReportViewer } from './_components/ReportViewer';
import { ScheduleEditor } from './_components/ScheduleEditor';
import type { ReportConfig, ReportData } from '@/lib/beithady/reports/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Schedule = {
  id: string;
  frequency: string;
  hour_cairo: number;
  day_of_week: number | null;
  day_of_month: number | null;
  email_recipients: string[];
  wa_channel_ids: string[];
  enabled: boolean;
  next_fire_at: string | null;
};

export default async function SavedReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireBeithadyPermission('analytics', 'read');
  const canEdit = await hasBeithadyPermission(user, 'analytics', 'full');
  const { id } = await params;

  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_saved_reports')
    .select('id, title, description, config, last_run_data, last_run_at, commentary')
    .eq('id', id)
    .maybeSingle();
  if (!row) notFound();

  const { data: scheds } = await sb
    .from('beithady_report_schedules')
    .select('*')
    .eq('report_id', id);

  const config = (row as { config: ReportConfig }).config;
  const lastData = ((row as { last_run_data?: ReportData | null }).last_run_data) || null;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Generate Report', href: '/beithady/analytics/reports' },
        { label: (row as { title: string }).title },
      ]}
      containerClass="max-w-[1400px]"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Report"
        title={(row as { title: string }).title}
        subtitle={
          (row as { description?: string | null }).description ||
          'Saved report. Click Run to refresh data, or download PDF/XLSX.'
        }
        right={
          <div className="flex items-center gap-2">
            <Link
              href={`/api/beithady/reports/${id}/pdf`}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
            >
              <Download size={14} /> PDF
            </Link>
            <Link
              href={`/api/beithady/reports/${id}/xlsx`}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <FileSpreadsheet size={14} /> XLSX
            </Link>
            {canEdit ? (
              <Link
                href={`/beithady/analytics/reports/builder?from=${id}`}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <Edit size={14} /> Edit
              </Link>
            ) : null}
          </div>
        }
      />

      <ReportViewer
        reportId={id}
        config={config}
        initialData={lastData}
        canEdit={canEdit}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Calendar size={14} /> Schedules
        </h2>
        <ScheduleEditor
          reportId={id}
          schedules={(scheds as Schedule[] | null) || []}
          canEdit={canEdit}
        />
      </section>
    </BeithadyShell>
  );
}
