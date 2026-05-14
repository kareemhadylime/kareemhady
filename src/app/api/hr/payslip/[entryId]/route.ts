import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getCurrentUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { entryToPayslipData, getPayrollMonth } from '@/lib/beithady/hr/hr-payroll-queries';
import { PayslipEn } from '@/app/beithady/hr/payroll/_components/payslip-en';
import { PayslipAr } from '@/app/beithady/hr/payroll/_components/payslip-ar';
import type { PayrollEntryRow } from '@/lib/beithady/hr/hr-payroll-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId } = await params;
  const sb = supabaseAdmin();

  const { data: entry, error } = await sb
    .from('hr_payroll_entries')
    .select('*, hr_employees(first_name, last_name, arabic_name, company_id, payslip_language, portrait_url, department)')
    .eq('id', entryId)
    .single();

  if (error || !entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  type RawEntry = typeof entry & {
    hr_employees: {
      first_name: string;
      last_name: string | null;
      arabic_name: string | null;
      company_id: string;
      payslip_language: string;
      portrait_url: string | null;
      department: string | null;
    } | null;
  };

  const raw = entry as RawEntry;
  const emp = raw.hr_employees;
  const { hr_employees: _, ...baseEntry } = raw;

  const entryRow: PayrollEntryRow = {
    ...baseEntry,
    employee_name:    emp ? `${emp.first_name} ${emp.last_name ?? ''}`.trim() : null,
    arabic_name:      emp?.arabic_name ?? null,
    bh_id:            emp?.company_id ?? null,
    payslip_language: (emp?.payslip_language ?? 'arabic') as 'arabic' | 'english',
    portrait_url:     emp?.portrait_url ?? null,
    department:       emp?.department ?? null,
  };

  const month = await getPayrollMonth(entryRow.month_id);
  const monthLabel = month?.label ?? '';
  const payslipData = entryToPayslipData(entryRow, monthLabel);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element: any = entryRow.payslip_language === 'english'
    ? React.createElement(PayslipEn, { data: payslipData })
    : React.createElement(PayslipAr, { data: payslipData });

  const buffer = await renderToBuffer(element);

  const safeName = (entryRow.bh_id ?? entryRow.sheet_name).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const safeMonth = monthLabel.replace(/\s+/g, '-');
  const filename = `payslip-${safeName}-${safeMonth}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
