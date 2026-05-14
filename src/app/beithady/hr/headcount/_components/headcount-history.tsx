// src/app/beithady/hr/headcount/_components/headcount-history.tsx
'use client';

import { useState } from 'react';
import { BUILDING_CODES, BUILDING_LABELS, DEPARTMENTS, DEPARTMENT_LABELS } from '@/lib/beithady/hr/hr-types';
import type { BuildingCode, Department } from '@/lib/beithady/hr/hr-types';
import type { HeadcountSnapshot } from '@/lib/beithady/hr/hr-headcount-types';

type Props = { initialRows: HeadcountSnapshot[] };

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export function HeadcountHistory({ initialRows }: Props) {
  const [rows, setRows]         = useState(initialRows);
  const [from, setFrom]         = useState(defaultFrom());
  const [to, setTo]             = useState(defaultTo());
  const [building, setBuilding] = useState('');
  const [dept, setDept]         = useState('');

  async function fetchRows(f: string, t: string, b: string, d: string) {
    const params = new URLSearchParams({ from: f, to: t });
    if (b) params.set('building', b);
    if (d) params.set('department', d);
    const res = await fetch(`/api/hr/headcount/history?${params}`);
    if (res.ok) {
      const { rows: r } = await res.json() as { rows: HeadcountSnapshot[] };
      setRows(r);
    }
  }

  function handleFrom(v: string)     { setFrom(v);     fetchRows(v, to, building, dept); }
  function handleTo(v: string)       { setTo(v);       fetchRows(from, v, building, dept); }
  function handleBuilding(v: string) { setBuilding(v); fetchRows(from, to, v, dept); }
  function handleDept(v: string)     { setDept(v);     fetchRows(from, to, building, v); }

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/70 mb-3">Daily Snapshot History</h2>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={from} onChange={e => handleFrom(e.target.value)} className="ix-input text-sm" />
        <input type="date" value={to}   onChange={e => handleTo(e.target.value)}   className="ix-input text-sm" />
        <select value={building} onChange={e => handleBuilding(e.target.value)} className="ix-input text-sm">
          <option value="">All Buildings</option>
          {(BUILDING_CODES as readonly string[]).map(b => (
            <option key={b} value={b}>{BUILDING_LABELS[b as BuildingCode] ?? b}</option>
          ))}
        </select>
        <select value={dept} onChange={e => handleDept(e.target.value)} className="ix-input text-sm">
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => (
            <option key={d} value={d}>{DEPARTMENT_LABELS[d as Department]}</option>
          ))}
        </select>
      </div>
      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Building</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-white/30 italic">
                  No snapshots found for this filter.
                </td>
              </tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/3">
                <td className="px-4 py-2 text-white/60 font-mono text-xs">{r.date}</td>
                <td className="px-4 py-2 text-white/70 text-sm">
                  {BUILDING_LABELS[r.building_code as BuildingCode] ?? r.building_code}
                </td>
                <td className="px-4 py-2 text-white/70 text-sm">
                  {DEPARTMENT_LABELS[r.department as Department] ?? r.department}
                </td>
                <td className="px-4 py-2 text-right">
                  <span className={`text-sm font-medium ${r.count === 0 ? 'text-white/20' : 'text-white'}`}>
                    {r.count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-white/30">{rows.length} records</p>
    </div>
  );
}
