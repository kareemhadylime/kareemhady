// src/app/fmplus/performance/_components/visible-sections.tsx
'use client';
import { useEffect, useState } from 'react';

const PANELS: { id: string; label: string }[] = [
  { id: 'kpi', label: 'KPIs' },
  { id: 'service_lines', label: 'Service Lines' },
  { id: 'variance', label: 'Variance' },
  { id: 'manning', label: 'Manning' },
  { id: 'categories', label: 'Categories' },
  { id: 'unmapped', label: 'Unmapped' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'ar_aging', label: 'AR Aging' },
  { id: 'penalties', label: 'Penalties' },
  { id: 'variation_orders', label: 'Variation Orders' },
  { id: 'cost_matrix', label: 'Cost Matrix' },
  { id: 'monthly_trend', label: 'Monthly Trend' },
  { id: 'overtime', label: 'Overtime' },
  { id: 'mobilization', label: 'Mobilization' },
  { id: 'signoff', label: 'Sign-off' },
  { id: 'yoy', label: 'Year-over-Year' },
  { id: 'anomalies', label: 'Anomalies' },
];

export function VisibleSections() {
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { setState(JSON.parse(localStorage.getItem('fmplus_perf_panels') ?? '{}')); } catch {}
  }, []);
  function toggle(id: string) {
    setState(prev => {
      const next = { ...prev, [id]: prev[id] === false ? true : false };
      localStorage.setItem('fmplus_perf_panels', JSON.stringify(next));
      window.dispatchEvent(new Event('fmplus_perf_panels_changed'));
      return next;
    });
  }
  return (
    <div className="grid grid-cols-2 gap-1 px-3 text-xs">
      {PANELS.map(p => (
        <label key={p.id} className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-fmplus-yellow">
          <input type="checkbox" checked={state[p.id] !== false} onChange={() => toggle(p.id)} className="accent-fmplus-yellow" />
          {p.label}
        </label>
      ))}
    </div>
  );
}
