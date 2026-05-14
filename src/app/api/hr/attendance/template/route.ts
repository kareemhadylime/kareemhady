// src/app/api/hr/attendance/template/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getActiveEmployeesForFilter } from '@/lib/beithady/hr/hr-attendance-queries';
import { BUILDING_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode } from '@/lib/beithady/hr/hr-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const date       = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const building   = searchParams.get('building') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  const employees = await getActiveEmployeesForFilter({ building, department });

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Attendance');

  ws.addRow(['Name', 'BH-ID', 'Building', 'Date', 'Status']);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  header.alignment = { horizontal: 'center' };

  for (const emp of employees) {
    ws.addRow([
      `${emp.first_name} ${emp.last_name ?? ''}`.trim(),
      emp.company_id,
      BUILDING_LABELS[emp.building_code as BuildingCode] ?? emp.building_code ?? '',
      date,
      '',
    ]);
  }

  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;

  ws.getColumn(5).eachCell({ includeEmpty: true }, (cell, rowNum) => {
    if (rowNum === 1) return;
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Present,Absent"'],
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const filterTag = building ?? department ?? 'all';
  const filename = `attendance-template-${date}-${filterTag}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
