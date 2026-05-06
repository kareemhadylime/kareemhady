// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use client';
import { useState, useTransition } from 'react';
import type { Template } from '@/lib/fmplus/budget/templates';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { CategoryBlock } from './category-block';
import { saveBudgetAction, publishBudgetAction } from '../actions';

export function EditorForm({
  projectId, projectName, year, scenario, serviceLine,
  template, budgetId, status, startMonth, initialLines,
}: {
  projectId: number; projectName: string; year: number; scenario: Scenario;
  serviceLine: ServiceLine; template: Template;
  budgetId: number | null; status: 'draft' | 'published'; startMonth: number;
  initialLines: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number; notes: string | null }>;
}) {
  const initialMap = new Map<string, { qty: number; unit_cost: number }>();
  for (const l of initialLines) {
    initialMap.set(`${l.category}|${l.line_code}|${l.sub_location ?? ''}|${l.season}`, { qty: l.qty, unit_cost: l.unit_cost });
  }
  const [rows, setRows] = useState(initialMap);
  const [sm, setSm] = useState(startMonth);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (template.is_stub) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{projectName} · {template.service_line.toUpperCase()}</h2>
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
          <strong>{template.service_line.toUpperCase()} template not yet defined.</strong> Drop the budget sheet for this service line in <code>FMPLUS/</code> and ping the team — once baked, you can come back and edit. A placeholder segment will be created if you save now (allowing variance to surface unmapped Odoo costs in Settings).
        </div>
      </section>
    );
  }

  const onChange = (key: string, qty: number, unit_cost: number) => {
    setRows(prev => {
      const next = new Map(prev);
      next.set(key, { qty, unit_cost });
      return next;
    });
  };

  const buildPayload = () => {
    const out: Array<{ sub_location: string | null; category: string; line_code: string; season: 'high'|'low'; qty: number; unit_cost: number }> = [];
    for (const [key, val] of rows.entries()) {
      const [category, line_code, subRaw, season] = key.split('|');
      if (val.qty === 0 && val.unit_cost === 0) continue;
      out.push({ sub_location: subRaw === '' ? null : subRaw,
                 category, line_code, season: season as 'high'|'low',
                 qty: val.qty, unit_cost: val.unit_cost });
    }
    return out;
  };

  const submit = (publish: boolean) => {
    const lines = buildPayload();
    startTransition(async () => {
      const action = publish ? publishBudgetAction : saveBudgetAction;
      const res = await action({
        projectId, year, scenario, serviceLine,
        startMonth: sm, lines,
      });
      setMsg(res.ok ? `${publish ? 'Published' : 'Draft saved'} · ${res.linesWritten} lines` : `Error: ${res.error}`);
    });
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{projectName} · {template.service_line.toUpperCase()}</h2>
          <p className="text-xs text-slate-500">FY {year} · Scenario: {scenario} · Status: <span className="capitalize">{status}</span></p>
        </div>
        <label className="text-sm">Start month:&nbsp;
          <select value={sm} onChange={e => setSm(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'long' })}</option>)}
          </select>
        </label>
      </header>
      {status === 'published' && (
        <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
          You&apos;re editing a <strong>published</strong> budget. Changes save immediately and are written to the audit log.
        </div>
      )}
      {template.schema_json.categories.map(c => (
        <CategoryBlock
          key={c.code}
          category={c.code}
          label={c.label}
          subLocations={template.schema_json.sub_locations_enabled ? template.schema_json.default_sub_locations : []}
          seasons={['high', 'low']}
          lineDefs={c.lines}
          rowsByKey={rows}
          onChange={onChange}
        />
      ))}
      <div className="flex gap-2 sticky bottom-0 bg-white dark:bg-slate-900 py-3 border-t border-slate-200 dark:border-slate-700">
        <button type="button" disabled={pending} onClick={() => submit(false)}
                className="px-4 py-2 rounded border border-slate-300 dark:border-slate-700 text-sm">
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" disabled={pending} onClick={() => submit(true)}
                className="px-4 py-2 rounded bg-amber-600 text-white text-sm">
          {pending ? 'Publishing…' : 'Publish'}
        </button>
        {msg && <span className="text-sm self-center text-slate-500">{msg}</span>}
      </div>
    </section>
  );
}
