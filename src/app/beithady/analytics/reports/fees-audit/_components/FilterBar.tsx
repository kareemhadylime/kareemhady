'use client';

import { Calendar, Building2, Filter, Calculator, Download, RefreshCw } from 'lucide-react';
import type { FeeAuditConfig, BuildingCode } from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';

const ALL_BUILDINGS: BuildingCode[] = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-DXB', 'OTHER'];
const ALL_CHANNELS: { key: ChannelBucket; label: string }[] = [
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'booking_com', label: 'Booking' },
  { key: 'other_ota', label: 'Other OTA' },
  { key: 'manual', label: 'Manual' },
];

export function FilterBar({
  config,
  onChange,
  onOpenVendorExport,
  onOpenTaxTester,
  loading,
}: {
  config: FeeAuditConfig;
  onChange: (c: FeeAuditConfig) => void;
  onOpenVendorExport: () => void;
  onOpenTaxTester: () => void;
  loading: boolean;
}) {
  return (
    <div className="ix-card p-3 flex items-center flex-wrap gap-3">
      <div className="flex items-center gap-1 text-xs">
        <Building2 size={14} className="text-slate-400" />
        <div className="flex flex-wrap gap-1">
          {ALL_BUILDINGS.map(b => {
            const active = config.buildings.includes(b);
            return (
              <button
                key={b}
                onClick={() =>
                  onChange({
                    ...config,
                    buildings: active
                      ? config.buildings.filter(x => x !== b)
                      : [...config.buildings, b],
                  })
                }
                className={`px-2 py-1 rounded text-[11px] ${
                  active
                    ? 'bg-[#1e3a5f] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {b}
              </button>
            );
          })}
          {config.buildings.length > 0 && (
            <button
              onClick={() => onChange({ ...config, buildings: [] })}
              className="text-[11px] text-slate-500 hover:text-rose-600"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

      <div className="flex items-center gap-1.5 text-xs">
        <Calendar size={14} className="text-slate-400" />
        <input
          type="date"
          value={config.startDate}
          onChange={e => onChange({ ...config, startDate: e.target.value })}
          className="rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
        />
        <select
          value={config.windowDays}
          onChange={e => onChange({ ...config, windowDays: Number(e.target.value) as 7 | 14 | 30 })}
          className="rounded border border-slate-200 px-2 py-1 text-xs dark:bg-slate-800 dark:border-slate-700"
        >
          <option value={7}>7d</option>
          <option value={14}>14d</option>
          <option value={30}>30d</option>
        </select>
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

      <div className="flex items-center gap-1 text-xs">
        <Filter size={14} className="text-slate-400" />
        {ALL_CHANNELS.map(c => {
          const active = config.channels.includes(c.key);
          return (
            <button
              key={c.key}
              onClick={() =>
                onChange({
                  ...config,
                  channels: active
                    ? config.channels.filter(x => x !== c.key)
                    : [...config.channels, c.key],
                })
              }
              className={`px-2 py-1 rounded text-[11px] ${
                active
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

      <div className="flex items-center gap-1 text-xs">
        {(['host_net', 'guest_gross', 'both'] as const).map(m => (
          <button
            key={m}
            onClick={() => onChange({ ...config, priceMode: m })}
            className={`px-2 py-1 rounded text-[11px] ${
              config.priceMode === m
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {m === 'host_net' ? 'Host Net' : m === 'guest_gross' ? 'Guest Gross' : 'Both'}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenTaxTester}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-300"
          title="Tax Stack Tester"
        >
          <Calculator size={12} /> Tax Tester
        </button>
        <button
          onClick={onOpenVendorExport}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
          title="Vendor CSV Export"
        >
          <Download size={12} /> Vendor CSV
        </button>
        {loading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
      </div>
    </div>
  );
}
