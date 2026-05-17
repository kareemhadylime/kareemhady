// src/app/api/hr/employee-template/route.ts
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  { header: 'Name',                    width: 28 },
  { header: 'Arabic Name',             width: 24 },
  { header: 'National ID',             width: 18 },
  { header: 'Date of Birth',           width: 14 },
  { header: 'Gender',                  width: 10, validation: '"Male,Female"' },
  { header: 'Phone',                   width: 16 },
  { header: 'Email',                   width: 26 },
  { header: 'Department',              width: 20, validation: '"Executive,Finance,Reservations,Real Estate,Engineering,Operations,Housekeeping,Security,Maintenance,Front of House,Drivers,Storekeeping,Lifeguard"' },
  { header: 'Position',                width: 22 },
  { header: 'Building',                width: 22, validation: '"Lotus 26,Lotus 73,A1 Hospitality,One Kattameya,Head Office,El-Gona"' },
  { header: 'Date Joined',             width: 14 },
  { header: 'Status',                  width: 14, validation: '"On Job,Probation,On Leave,Terminated"' },
  { header: 'Salary Package',          width: 16 },
  { header: 'Transportation Allowance',width: 26 },
  { header: 'Fixed Bonus',             width: 14 },
  { header: 'Contract Type',           width: 16, validation: '"Permanent,Fixed Term,Hourly"' },
  { header: 'Payment Method',          width: 16, validation: '"Bank,Cash"' },
  { header: 'Bank IBAN',               width: 34 },
] as const;

const EXAMPLES = [
  [
    'Ahmed Mohamed', 'أحمد محمد', '12345678901234', '1990-05-15', 'Male',
    '01001234567', 'ahmed@example.com', 'Housekeeping', 'Housekeeper',
    'Lotus 26', '2024-01-01', 'On Job', 5000, 300, 0, 'Permanent', 'Bank',
    'EG123456789012345678901234',
  ],
  [
    'Sara Ali', 'سارة علي', '98765432109876', '1995-11-20', 'Female',
    '01112345678', '', 'Reservations', 'Reservation Agent',
    'Head Office', '2024-03-15', 'On Job', 8000, 500, 200, 'Permanent', 'Cash', '',
  ],
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  // ── Sheet 1: Employees ─────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Employees');

  // Title row (row 1)
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Beit Hady — Employee Import Template';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;

  // Instructions row (row 2)
  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const instrCell = ws.getCell('A2');
  instrCell.value =
    'Fill in one employee per row. Name, Position, and Building are required. Dates must be YYYY-MM-DD. ' +
    'Use the dropdowns for Gender, Department, Building, Status, Contract Type, and Payment Method. ' +
    'Delete the two grey example rows before uploading.';
  instrCell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  instrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  instrCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(2).height = 36;

  // Header row (row 3)
  const headerRow = ws.addRow(COLUMNS.map(c => c.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 22;

  // Set column widths
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
  });

  // Example rows (rows 4–5) — grey italic, HR should delete before uploading
  for (const ex of EXAMPLES) {
    const row = ws.addRow(ex);
    row.font = { italic: true, color: { argb: 'FF94A3B8' }, size: 9 };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  }

  // Data validation dropdowns for rows 6–500
  COLUMNS.forEach((col, i) => {
    if (!('validation' in col) || !col.validation) return;
    const colLetter = ws.getColumn(i + 1).letter;
    for (let r = 6; r <= 500; r++) {
      ws.getCell(`${colLetter}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [col.validation as string],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: 'Please choose a value from the dropdown list.',
      };
    }
  });

  // Freeze title + instruction + header rows while scrolling
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  // ── Sheet 2: Reference ─────────────────────────────────────────────────────
  const ref = wb.addWorksheet('Reference');
  const refHeaders = ['Buildings', 'Departments', 'Statuses', 'Contract Types', 'Payment Methods'];
  const refHeader = ref.addRow(refHeaders);
  refHeader.font = { bold: true };
  refHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

  const refData: string[][] = [
    ['Lotus 26', 'Lotus 73', 'A1 Hospitality', 'One Kattameya', 'Head Office', 'El-Gona'],
    ['Executive', 'Finance', 'Reservations', 'Real Estate', 'Engineering', 'Operations', 'Housekeeping', 'Security', 'Maintenance', 'Front of House', 'Drivers', 'Storekeeping', 'Lifeguard'],
    ['On Job', 'Probation', 'On Leave', 'Terminated'],
    ['Permanent', 'Fixed Term', 'Hourly'],
    ['Bank', 'Cash'],
  ];

  const maxRows = Math.max(...refData.map(col => col.length));
  for (let r = 0; r < maxRows; r++) {
    ref.addRow(refData.map(col => col[r] ?? ''));
  }
  refHeaders.forEach((_, i) => { ref.getColumn(i + 1).width = 20; });

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employee-import-template.xlsx"',
    },
  });
}
