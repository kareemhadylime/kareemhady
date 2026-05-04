'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ChevronRight, ChevronDown } from 'lucide-react';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { saveRevenueAction } from '../actions';

interface RevenueRow {
  service_line: ServiceLine;
  monthly_revenue: number;
  vat_pct: number;
  manpower_ramp: Record<string, number>;
}

interface Props {
  yearId: number;
  yearIndex: number;
  initialRows: RevenueRow[];
  canEdit: boolean;
}

const SERVICE_LABELS: Record<ServiceLine, string> = {
  hk: 'Housekeeping', mep: 'MEP', landscape: 'Landscape', security: 'Security',
  pest_ctrl: 'Pest Ctrl', waste_mgmt: 'Waste Mgmt', back_office: 'Back Office',
};

export function RevenueTab({ yearId, yearIndex, initialRows, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RevenueRow[]>(initialRows);
  const [expanded, setExpanded] = useState<Set<ServiceLine>>(new Set());

  const updateRow = (idx: number, patch: Partial<RevenueRow>) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const updateRamp = (idx: number, jsonText: string) => {
    try {
      const parsed = jsonText.trim() === '' ? {} : JSON.parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Must be a JSON object');
      }
      // Coerce values to numbers; reject non-numerics
      const coerced: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`${k}: must be a number`);
        coerced[k] = n;
      }
      updateRow(idx, { manpower_ramp: coerced });
      setError(null);
    } catch (e) {
      setError(`Row ${idx + 1} ramp JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onSave = () => {
    if (!canEdit) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveRevenueAction({
          year_id: yearId,
          rows: rows.map(r => ({
            service_line: r.service_line,
            monthly_revenue: r.monthly_revenue,
            vat_pct: r.vat_pct,
            manpower_ramp: r.manpower_ramp,
          })),
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const totalMonthly = rows.reduce((a, r) => a + r.monthly_revenue, 0);
  const totalAnnual = totalMonthly * 12;

  return (
    <div className="space-y-3">
      <div className="bg-bg-tertiary border border-border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <strong className="text-sm text-text-primary">Revenue · Y{yearIndex}</strong>
          <span className="text-xs text-text-secondary">
            Total monthly: <strong className="tabular-nums">{totalMonthly.toLocaleString()}</strong> EGP
            {' · '}
            Annual: <strong className="tabular-nums">{(totalAnnual / 1_000_000).toFixed(2)} M</strong>
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-text-secondary italic py-4 text-center">
            No services on this year. Add services from the Project Hub or contract metadata.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r, idx) => {
              const isExpanded = expanded.has(r.service_line);
              return (
                <div key={r.service_line} className="bg-bg-secondary border border-border rounded p-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-[100px]">
                      <div className="text-[10px] text-text-secondary uppercase">Service</div>
                      <div className="text-sm font-semibold text-text-primary">{SERVICE_LABELS[r.service_line]}</div>
                    </div>
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">Monthly Revenue (EGP)</span>
                      <input type="number" min="0" step="0.01" value={r.monthly_revenue}
                        onChange={e => updateRow(idx, { monthly_revenue: Number(e.currentTarget.value) || 0 })}
                        disabled={!canEdit || isPending}
                        className="w-32 px-2 py-1 text-sm bg-bg-primary border border-border rounded text-right tabular-nums disabled:opacity-50" />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-text-secondary uppercase block">VAT %</span>
                      <input type="number" min="0" max="100" step="0.1" value={r.vat_pct}
                        onChange={e => updateRow(idx, { vat_pct: Number(e.currentTarget.value) || 0 })}
                        disabled={!canEdit || isPending}
                        className="w-16 px-2 py-1 text-sm bg-bg-primary border border-border rounded text-right tabular-nums disabled:opacity-50" />
                    </label>
                    <button type="button"
                      onClick={() => setExpanded(prev => {
                        const next = new Set(prev);
                        if (next.has(r.service_line)) next.delete(r.service_line); else next.add(r.service_line);
                        return next;
                      })}
                      className="ml-auto text-[11px] text-text-secondary hover:text-text-primary inline-flex items-center gap-1">
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Manpower ramp
                      {Object.keys(r.manpower_ramp).length > 0 && (
                        <span className="text-[9px] text-accent">({Object.keys(r.manpower_ramp).length})</span>
                      )}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-2 pl-1">
                      <div className="text-[10px] text-text-secondary mb-1">
                        JSON object mapping role line_codes to override headcounts. Empty = use template defaults.
                        Example: <code>{`{ "hk_mf_8h": 240, "sup_8h": 8 }`}</code>
                      </div>
                      <textarea
                        defaultValue={Object.keys(r.manpower_ramp).length > 0 ? JSON.stringify(r.manpower_ramp, null, 2) : ''}
                        onBlur={e => updateRamp(idx, e.currentTarget.value)}
                        disabled={!canEdit || isPending}
                        placeholder='{}'
                        rows={3}
                        className="w-full text-[11px] font-mono bg-bg-primary border border-border rounded px-2 py-1 disabled:opacity-50" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onSave} disabled={!canEdit || isPending}
            className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
            <Save size={12} /> {isPending ? 'Saving…' : 'Save Revenue'}
          </button>
        </div>
      </div>
    </div>
  );
}
