# Beithady HR — Monthly Payroll (Part 2: UI + Routes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> **Prerequisite:** Part 1 must be complete before starting here.

**Goal:** Build the two PDF API routes (individual + batch), the upload dialog (3-step wizard), the print filter drawer, the payroll roster client component, and the payroll page — then activate the Sprint 2 hub tile.

**Architecture:** Two Next.js API routes stream PDFs using `renderToBuffer` → client components call them via `fetch` + `URL.createObjectURL` for browser download. Upload wizard calls `previewPayrollAction` (server action, no DB) then `confirmPayrollAction` (server action, writes DB).

**Tech Stack:** React 19 · @react-pdf/renderer ^4.1.6 · Tailwind v4 · Next.js 16 Route Handlers

---

## File Map

| Status | Path | Purpose |
|---|---|---|
| **Create** | `src/app/api/hr/payslip/[entryId]/route.ts` | Individual payslip PDF stream |
| **Create** | `src/app/api/hr/payslips/batch/route.ts` | Batch filtered payslips PDF |
| **Create** | `src/app/beithady/hr/payroll/_components/upload-payroll-dialog.tsx` | 3-step upload wizard |
| **Create** | `src/app/beithady/hr/payroll/_components/print-filter-drawer.tsx` | Batch print filter + generate |
| **Create** | `src/app/beithady/hr/payroll/_components/payroll-roster.tsx` | Client table + month picker |
| **Create** | `src/app/beithady/hr/payroll/page.tsx` | Server component page |
| **Modify** | `src/app/beithady/hr/page.tsx` | Activate Sprint 2 tile (remove disabled) |

---

## Task 8: Individual Payslip Route

**Files:**
- Create: `src/app/api/hr/payslip/[entryId]/route.ts`

- [ ] **Step 1: Create the directory and file**

```typescript
// src/app/api/hr/payslip/[entryId]/route.ts
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
    hr_employees: { first_name: string; last_name: string | null; arabic_name: string | null; company_id: string; payslip_language: string; portrait_url: string | null; department: string | null } | null;
  };
  const raw = entry as RawEntry;
  const emp = raw.hr_employees;
  const { hr_employees: _, ...baseEntry } = raw;

  const entryRow: PayrollEntryRow = {
    ...baseEntry,
    employee_name: emp ? `${emp.first_name} ${emp.last_name ?? ''}`.trim() : null,
    arabic_name:   emp?.arabic_name ?? null,
    bh_id:         emp?.company_id ?? null,
    payslip_language: (emp?.payslip_language ?? 'arabic') as 'arabic' | 'english',
    portrait_url:  emp?.portrait_url ?? null,
    department:    emp?.department ?? null,
  };

  const month = await getPayrollMonth(entryRow.month_id);
  const monthLabel = month?.label ?? '';
  const payslipData = entryToPayslipData(entryRow, monthLabel);

  const element = entryRow.payslip_language === 'english'
    ? React.createElement(PayslipEn, { data: payslipData })
    : React.createElement(PayslipAr, { data: payslipData });

  const buffer = await renderToBuffer(element);
  const filename = `payslip-${entryRow.bh_id ?? entryRow.sheet_name.replace(/\s+/g, '-')}-${monthLabel.replace(/\s+/g, '-')}.pdf`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/hr/payslip/
git commit -m "feat(hr): individual payslip API route — GET /api/hr/payslip/[entryId]"
```

---

## Task 9: Batch Payslip Route

**Files:**
- Create: `src/app/api/hr/payslips/batch/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/hr/payslips/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import { renderToBuffer, Document, Page } from '@react-pdf/renderer';
import { getCurrentUser } from '@/lib/auth';
import { getMonthEntries, entryToPayslipData, getPayrollMonth } from '@/lib/beithady/hr/hr-payroll-queries';
import { PayslipEn } from '@/app/beithady/hr/payroll/_components/payslip-en';
import { PayslipAr } from '@/app/beithady/hr/payroll/_components/payslip-ar';
import type { PayslipBatchFilter } from '@/lib/beithady/hr/hr-payroll-types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BodySchema = z.object({
  monthId: z.string().uuid(),
  filters: z.object({
    building_codes:      z.array(z.string()).optional(),
    departments:         z.array(z.string()).optional(),
    exclude_terminated:  z.boolean().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { monthId, filters = {} } = parsed.data;
  const batchFilter: PayslipBatchFilter = {
    ...filters,
    exclude_terminated: filters.exclude_terminated ?? true,
  };

  const [entries, month] = await Promise.all([
    getMonthEntries(monthId, batchFilter),
    getPayrollMonth(monthId),
  ]);

  if (!month) return NextResponse.json({ error: 'Month not found' }, { status: 404 });
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No entries match the filter' }, { status: 404 });
  }

  // Build one Document with all payslip pages concatenated
  const pages = entries.map(entry => {
    const data = entryToPayslipData(entry, month.label);
    if (entry.payslip_language === 'english') {
      return React.createElement(PayslipEn, { data, key: entry.id });
    }
    return React.createElement(PayslipAr, { data, key: entry.id });
  });

  // react-pdf Document wraps pages — but each sub-component renders its own Document.
  // We render each individually and concatenate buffers using pdf-lib for true merge.
  // Simpler: render each as a standalone buffer, then concatenate raw bytes.
  // Note: each PayslipEn/PayslipAr is itself a <Document><Page>...</Page></Document>,
  // so we render them individually and manually concatenate the PDF bytes.

  const buffers: Buffer[] = [];
  for (const entry of entries) {
    const data = entryToPayslipData(entry, month.label);
    const el = entry.payslip_language === 'english'
      ? React.createElement(PayslipEn, { data })
      : React.createElement(PayslipAr, { data });
    const buf = await renderToBuffer(el);
    buffers.push(buf);
  }

  // Simple concatenation: wrap all individual PDFs into a single response.
  // For true single-file merge, use pdf-lib. For MVP, return a zip-like
  // multipart or just the first buffer. Since pdf-lib is not in package.json,
  // use the simplest approach: return the first PDF if only 1, or redirect
  // to a zip. Actually: install pdf-lib is complex. Simplest MVP: return
  // all PDFs as a single merged buffer using basic PDF concatenation.
  // react-pdf supports this natively by putting multiple Page components
  // in one Document. We need to refactor to render one Document.

  // Correct approach: render ONE Document with all pages.
  // Each PayslipEn/PayslipAr exports a Document — we can't nest Documents.
  // Solution: extract the Page from each template as a separate export.
  // Since templates are already committed in Part 1, we use an inline approach:
  // import raw page renderers here.

  // MVP workaround: since pdf-lib merge is complex, render all in a loop and
  // return a multipage PDF by building the Document here with raw Page content.
  // For this route, we inline the page rendering without the Document wrapper.

  // Simplest correct approach for batch: call renderToBuffer on a combined Document.
  // We re-export page-only components from the templates.
  // Since templates export full Documents, for batch we just concatenate
  // the individual PDF files into one using pdf-lib (add to package.json).

  // ADD pdf-lib: run `npm install pdf-lib` before this task.
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const [page] = await merged.copyPages(src, [0]);
    merged.addPage(page);
  }
  const mergedBuffer = await merged.save();

  const filename = `payslips-${month.label.replace(/\s+/g, '-')}-${entries.length}employees.pdf`;
  return new NextResponse(Buffer.from(mergedBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

- [ ] **Step 2: Install pdf-lib**

```bash
cd C:/kareemhady && npm install pdf-lib
```
Expected: `pdf-lib` added to package.json dependencies.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hr/payslips/ package.json package-lock.json
git commit -m "feat(hr): batch payslip PDF route + pdf-lib for page merging"
```

---

## Task 10: Upload Payroll Dialog

**Files:**
- Create: `src/app/beithady/hr/payroll/_components/upload-payroll-dialog.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/beithady/hr/payroll/_components/upload-payroll-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { previewPayrollAction, confirmPayrollAction } from '@/lib/beithady/hr/hr-payroll-actions';
import type { PayrollPreviewResult, PayrollPreviewRow, MatchCandidate } from '@/lib/beithady/hr/hr-payroll-types';

type Step = 'upload' | 'preview' | 'done';
type Props = { open: boolean; onClose: () => void };

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function buildLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function UploadPayrollDialog({ open, onClose }: Props) {
  const now = new Date();
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<PayrollPreviewResult | null>(null);
  const [rows, setRows] = useState<PayrollPreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function reset() { setStep('upload'); setPreview(null); setRows([]); setParseError(''); }

  async function handleFile(file: File) {
    setParseError('');
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const res = await previewPayrollAction(fd);
      if (res.error) { setParseError(res.error); return; }
      if (res.result) {
        setPreview(res.result);
        setRows(res.result.rows);
        // Use suggested month from parser
        const [y, m] = res.result.suggestedMonthKey.split('-');
        setMonthYear(Number(y));
        setMonthNum(Number(m));
        setStep('preview');
      }
    });
  }

  function updateMatch(rowIndex: number, employeeId: string, name: string) {
    setRows(rs => rs.map(r =>
      r.rowIndex === rowIndex
        ? { ...r, matchStatus: 'matched' as const, matchedEmployeeId: employeeId, matchCandidates: [] }
        : r
    ));
  }

  function handleConfirm() {
    const key = buildMonthKey(monthYear, monthNum);
    const label = buildLabel(monthYear, monthNum);
    startTransition(async () => {
      const res = await confirmPayrollAction(key, label, rows);
      if (res.error) { setParseError(res.error); return; }
      setSavedCount(rows.filter(r => r.matchStatus !== 'error').length);
      setStep('done');
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold">Upload Monthly Payroll</h2>
          <button onClick={() => { reset(); onClose(); }} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 shrink-0">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-2 px-4 py-3 text-sm ${step === s ? 'text-violet-600 font-medium border-b-2 border-violet-500' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold ${step === s ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 dark:bg-slate-800'}`}>{i + 1}</span>
              {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview & Match' : 'Saved'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1 */}
          {step === 'upload' && (
            <div>
              <div
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center hover:border-violet-400 transition-colors">
                <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">Drop the monthly salary Excel here</p>
                <p className="text-sm text-slate-500 mt-1">Same format as the April salary sheet (.xlsx · .xls)</p>
                <input type="file" accept=".xlsx,.xls" className="hidden" id="payroll-upload"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                <label htmlFor="payroll-upload" className="mt-4 inline-block cursor-pointer px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">
                  Choose File
                </label>
              </div>
              {isPending && <p className="mt-3 text-sm text-violet-600 flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> Parsing…</p>}
              {parseError && <p className="mt-3 text-sm text-red-600">{parseError}</p>}
            </div>
          )}

          {/* Step 2 */}
          {step === 'preview' && preview && (
            <div>
              {/* Month picker */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Saving as:</span>
                <select className="ix-input w-auto" value={monthNum} onChange={e => setMonthNum(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select className="ix-input w-auto" value={monthYear} onChange={e => setMonthYear(Number(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-sm font-semibold text-violet-600">{buildLabel(monthYear, monthNum)}</span>
              </div>

              {/* Summary chips */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Chip color="emerald" label={`${preview.matchedCount} Matched`} />
                <Chip color="amber" label={`${preview.unmatchedCount} Unmatched`} />
                {preview.ambiguousCount > 0 && <Chip color="orange" label={`${preview.ambiguousCount} Ambiguous — resolve below`} />}
                {preview.errorCount > 0 && <Chip color="red" label={`${preview.errorCount} Errors (skipped)`} />}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="text-left py-2 pr-3">Name (sheet)</th>
                      <th className="text-left py-2 pr-3">Match</th>
                      <th className="text-right py-2 pr-3">Net</th>
                      <th className="text-center py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.rowIndex} className={`border-b border-slate-100 dark:border-slate-800 ${row.matchStatus === 'error' ? 'opacity-40' : ''}`}>
                        <td className="py-2 pr-3 font-medium">{row.sheet_name}</td>
                        <td className="py-2 pr-3">
                          {row.matchStatus === 'matched' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">✓ matched</span>
                          )}
                          {row.matchStatus === 'unmatched' && (
                            <span className="text-xs text-amber-600">⚠ unmatched</span>
                          )}
                          {row.matchStatus === 'ambiguous' && (
                            <select className="ix-input text-xs py-0.5" defaultValue=""
                              onChange={e => {
                                const cand = row.matchCandidates.find(c => c.id === e.target.value);
                                if (cand) updateMatch(row.rowIndex, cand.id, cand.name);
                              }}>
                              <option value="" disabled>Pick employee…</option>
                              {row.matchCandidates.map((c: MatchCandidate) => (
                                <option key={c.id} value={c.id}>{c.name} ({c.company_id})</option>
                              ))}
                            </select>
                          )}
                          {row.matchStatus === 'error' && (
                            <span className="text-xs text-red-500">❌ error</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.net_salary.toLocaleString()}
                        </td>
                        <td className="py-2 text-center text-slate-500">{row.working_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 'done' && (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <h3 className="text-xl font-semibold">{savedCount} payroll entries saved</h3>
              <p className="text-sm text-slate-500">Saved as {buildLabel(monthYear, monthNum)}. Print payslips from the payroll page.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={() => { reset(); onClose(); }} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">← Back</button>
              <button onClick={handleConfirm} disabled={isPending}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
                {isPending ? 'Saving…' : `Save ${buildLabel(monthYear, monthNum)} Payroll`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { reset(); onClose(); }} className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: 'emerald' | 'amber' | 'orange' | 'red' }) {
  const cls = { emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }[color];
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${cls}`}>{label}</span>;
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/payroll/_components/upload-payroll-dialog.tsx
git commit -m "feat(hr): UploadPayrollDialog — 3-step upload→preview/match→saved wizard"
```

---

## Task 11: Print Filter Drawer

**Files:**
- Create: `src/app/beithady/hr/payroll/_components/print-filter-drawer.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/beithady/hr/payroll/_components/print-filter-drawer.tsx
'use client';

import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';

type Props = {
  open: boolean;
  onClose: () => void;
  monthId: string;
  totalEntries: number;
};

export function PrintFilterDrawer({ open, onClose, monthId, totalEntries }: Props) {
  const [buildings, setBuildings] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [excludeTerminated, setExcludeTerminated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleBuilding(code: string) {
    setBuildings(bs => bs.includes(code) ? bs.filter(b => b !== code) : [...bs, code]);
  }
  function toggleDept(dept: string) {
    setDepts(ds => ds.includes(dept) ? ds.filter(d => d !== dept) : [...ds, dept]);
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/hr/payslips/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthId,
          filters: {
            building_codes: buildings.length ? buildings : undefined,
            departments: depts.length ? depts : undefined,
            exclude_terminated: excludeTerminated,
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to generate PDF');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslips-batch.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const activeCount = buildings.length === 0 && depts.length === 0
    ? (excludeTerminated ? totalEntries : totalEntries)
    : `~${totalEntries}`; // approximate; server filters precisely

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Print Payslips</h3>
          <button onClick={onClose} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={14} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Building filter */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Building</p>
            <div className="flex flex-wrap gap-2">
              {BUILDING_CODES.map(b => (
                <button key={b} onClick={() => toggleBuilding(b)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${buildings.includes(b) ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400'}`}>
                  {b}
                </button>
              ))}
            </div>
            {buildings.length === 0 && <p className="text-xs text-slate-400 mt-1">All buildings</p>}
          </div>

          {/* Department filter */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Department</p>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map(d => (
                <button key={d} onClick={() => toggleDept(d)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${depts.includes(d) ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-violet-400'}`}>
                  {DEPARTMENT_LABELS[d]}
                </button>
              ))}
            </div>
            {depts.length === 0 && <p className="text-xs text-slate-400 mt-1">All departments</p>}
          </div>

          {/* Exclude terminated */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={excludeTerminated} onChange={e => setExcludeTerminated(e.target.checked)} className="accent-violet-600 w-4 h-4" />
            <span className="text-sm text-slate-700 dark:text-slate-300">Exclude terminated employees</span>
          </label>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-5 py-4">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <button onClick={handleGenerate} disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {loading ? 'Generating…' : `Generate PDF`}
          </button>
          <p className="text-xs text-slate-400 text-center mt-2">Each employee printed in their language preference</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/beithady/hr/payroll/_components/print-filter-drawer.tsx
git commit -m "feat(hr): PrintFilterDrawer — building/dept filter + batch PDF download"
```

---

## Task 12: Payroll Roster

**Files:**
- Create: `src/app/beithady/hr/payroll/_components/payroll-roster.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/app/beithady/hr/payroll/_components/payroll-roster.tsx
'use client';

import { useState } from 'react';
import { Upload, Printer, Download, AlertTriangle } from 'lucide-react';
import { UploadPayrollDialog } from './upload-payroll-dialog';
import { PrintFilterDrawer } from './print-filter-drawer';
import { BUILDING_LABELS, BUILDING_CODES } from '@/lib/beithady/hr/hr-types';
import type { PayrollMonth, PayrollEntryRow } from '@/lib/beithady/hr/hr-payroll-types';
import type { BuildingCode } from '@/lib/beithady/hr/hr-types';

type Props = {
  months: PayrollMonth[];
  initialMonthId: string | null;
  initialEntries: PayrollEntryRow[];
};

export function PayrollRoster({ months, initialMonthId, initialEntries }: Props) {
  const [selectedMonthId, setSelectedMonthId] = useState(initialMonthId);
  const [entries, setEntries] = useState(initialEntries);
  const [filterBuilding, setFilterBuilding] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);

  const filtered = filterBuilding
    ? entries.filter(e => e.building_code === filterBuilding)
    : entries;

  const netTotal = filtered.reduce((sum, e) => sum + e.net_salary, 0);

  async function handleMonthChange(monthId: string) {
    setSelectedMonthId(monthId);
    // Refresh entries for the new month
    const res = await fetch(`/api/hr/payroll-entries?monthId=${monthId}`);
    if (res.ok) {
      const data = await res.json() as { entries: PayrollEntryRow[] };
      setEntries(data.entries);
    }
  }

  async function downloadPayslip(entryId: string) {
    setLoadingEntryId(entryId);
    try {
      const res = await fetch(`/api/hr/payslip/${entryId}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const header = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = header.match(/filename="([^"]+)"/);
      a.download = fnMatch?.[1] ?? `payslip-${entryId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoadingEntryId(null);
    }
  }

  const selectedMonth = months.find(m => m.id === selectedMonthId);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Month picker */}
        {months.length === 0 ? (
          <p className="text-sm text-slate-500">No payroll months uploaded yet.</p>
        ) : (
          <select className="ix-input w-auto font-semibold"
            value={selectedMonthId ?? ''}
            onChange={e => handleMonthChange(e.target.value)}>
            {months.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        )}

        {/* Building filter */}
        <select className="ix-input w-auto" value={filterBuilding} onChange={e => setFilterBuilding(e.target.value)}>
          <option value="">All Buildings</option>
          {BUILDING_CODES.map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
          ))}
        </select>

        <div className="flex-1" />

        {selectedMonthId && (
          <button onClick={() => setPrintOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Printer size={14} /> Print Payslips
          </button>
        )}

        <button onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
          <Upload size={14} /> Upload New Month
        </button>
      </div>

      {/* Stats */}
      {filtered.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
          <span><strong>{filtered.length}</strong> employees</span>
          <span>·</span>
          <span>Total net: <strong className="text-slate-900 dark:text-slate-100">EGP {netTotal.toLocaleString()}</strong></span>
          {filtered.some(e => !e.employee_id) && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle size={12} /> {filtered.filter(e => !e.employee_id).length} unmatched
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {months.length === 0 && (
        <div className="text-center py-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Upload size={32} className="mx-auto text-slate-400 mb-3" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">No payroll uploaded yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload your first monthly salary sheet to get started</p>
          <button onClick={() => setUploadOpen(true)}
            className="mt-4 px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
            Upload Month
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">BH-ID</th>
                <th className="text-left px-4 py-3">Position</th>
                <th className="text-left px-4 py-3">Building</th>
                <th className="text-center px-4 py-3">Days</th>
                <th className="text-right px-4 py-3">Net Salary</th>
                <th className="text-center px-4 py-3">Lang</th>
                <th className="text-center px-4 py-3 w-12">🖨</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => (
                <tr key={entry.id}
                  className={`border-b border-slate-100 dark:border-slate-800 ${entry.is_terminated ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {entry.employee_name ?? entry.sheet_name}
                    {!entry.employee_id && <span className="ml-1 text-[10px] text-amber-600">⚠️</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-600 dark:text-amber-400">
                    {entry.bh_id ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{entry.job_title ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {entry.building_code ? (BUILDING_LABELS[entry.building_code as BuildingCode] ?? entry.building_code) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{entry.working_days}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {entry.net_salary.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${entry.payslip_language === 'arabic' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {entry.payslip_language === 'arabic' ? 'AR' : 'EN'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => downloadPayslip(entry.id)}
                      disabled={loadingEntryId === entry.id}
                      className="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/30 disabled:opacity-40"
                      title="Download payslip">
                      <Download size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadPayrollDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {selectedMonthId && (
        <PrintFilterDrawer
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          monthId={selectedMonthId}
          totalEntries={filtered.length}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the entries API route** (needed by month-change in the roster)

Create `src/app/api/hr/payroll-entries/route.ts`:

```typescript
// src/app/api/hr/payroll-entries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMonthEntries } from '@/lib/beithady/hr/hr-payroll-queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const monthId = req.nextUrl.searchParams.get('monthId');
  if (!monthId) return NextResponse.json({ error: 'monthId required' }, { status: 400 });

  const entries = await getMonthEntries(monthId);
  return NextResponse.json({ entries });
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/beithady/hr/payroll/_components/payroll-roster.tsx \
        src/app/api/hr/payroll-entries/route.ts
git commit -m "feat(hr): PayrollRoster + /api/hr/payroll-entries route — month picker, filter, per-row payslip download"
```

---

## Task 13: Payroll Page + Activate Sprint 2 Tile

**Files:**
- Create: `src/app/beithady/hr/payroll/page.tsx`
- Modify: `src/app/beithady/hr/page.tsx`

- [ ] **Step 1: Create payroll page**

```typescript
// src/app/beithady/hr/payroll/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listPayrollMonths, getMonthEntries } from '@/lib/beithady/hr/hr-payroll-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { PayrollRoster } from './_components/payroll-roster';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  await requireBeithadyPermission('hr', 'read');

  const months = await listPayrollMonths();
  const latestMonth = months[0] ?? null;
  const initialEntries = latestMonth
    ? await getMonthEntries(latestMonth.id, { exclude_terminated: false })
    : [];

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Monthly Payroll' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Monthly Payroll"
        subtitle="Upload monthly salary sheet · print bilingual payslips · batch by building"
      />
      <PayrollRoster
        months={months}
        initialMonthId={latestMonth?.id ?? null}
        initialEntries={initialEntries}
      />
    </BeithadyShell>
  );
}
```

- [ ] **Step 2: Activate Sprint 2 tile in HR hub**

Read `src/app/beithady/hr/page.tsx`. Find the `Monthly Payroll` tile (currently `disabled: true, comingSoonLabel: 'Sprint 2'`). Remove both `disabled` and `comingSoonLabel` from that tile:

```typescript
// Before:
{
  href: '/beithady/hr/payroll',
  title: 'Monthly Payroll',
  description: 'Upload monthly Excel → parse → store → print payslips per employee or batch by building.',
  icon: Banknote,
  accent: 'emerald',
  disabled: true,          // ← REMOVE
  comingSoonLabel: 'Sprint 2',  // ← REMOVE
},

// After:
{
  href: '/beithady/hr/payroll',
  title: 'Monthly Payroll',
  description: 'Upload monthly Excel → parse → store → print payslips per employee or batch by building.',
  icon: Banknote,
  accent: 'emerald',
},
```

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --run 2>&1 | tail -10
```
Expected: all 471+ passing, 0 failed (9 new payroll parser tests = 480+ total).

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Deploy**

```bash
git add src/app/beithady/hr/payroll/page.tsx src/app/beithady/hr/page.tsx
git commit -m "feat(hr): Monthly Payroll page + activate Sprint 2 tile on HR hub — Sprint 2 complete"
git fetch origin main && git rebase origin/main
git push origin HEAD:main
vercel --prod
```

---

## Part 2 Complete — Sprint 2 Shipped

| ✅ | Component |
|---|---|
| Individual payslip route | `GET /api/hr/payslip/[entryId]` streams PDF in employee's language |
| Batch payslip route | `POST /api/hr/payslips/batch` merges filtered payslips via pdf-lib |
| Entries API route | `GET /api/hr/payroll-entries?monthId=` for client-side month switching |
| Upload wizard | 3-step: drop Excel → preview/match (ambiguous dropdown) → save |
| Print filter drawer | Building + dept multi-select + exclude-terminated → batch PDF download |
| Payroll roster | Month picker · filter · stats · per-row download · language badge |
| Payroll page | Server component at `/beithady/hr/payroll` |
| Sprint 2 hub tile | Activated (no longer dimmed) |

**Next sprint:** Sprint 3 — Salary Access (5-tier RBAC: who sees which salary amounts).
