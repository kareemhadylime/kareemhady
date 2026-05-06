// src/app/fmplus/performance/_components/panel-header.tsx
'use client';
import { ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onHide: () => void;
}
export function PanelHeader({ title, subtitle, collapsed, onToggleCollapse, onHide }: Props) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight font-serif">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggleCollapse} aria-label={collapsed ? 'Expand panel' : 'Collapse panel'} className="p-1 rounded hover:bg-slate-700/50 transition">
          <ChevronDown size={16} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <button onClick={onHide} aria-label="Hide panel" className="p-1 rounded hover:bg-slate-700/50 transition">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
