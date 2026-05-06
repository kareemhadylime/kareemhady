'use client';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { PanelHeader } from '../panel-header';
import { usePanelState } from '../panel-state';
import type { SignoffBlock } from '@/lib/fmplus/performance/types';

export function SignoffPanel({ block }: { block: SignoffBlock }) {
  const { visible, collapsed, hide, toggleCollapse } = usePanelState('signoff');
  if (!visible) return null;
  const isPublished = block.current_year_status === 'published';
  const isStale = (block.days_stale ?? 0) > 30;
  const Icon = isPublished && !isStale ? CheckCircle2 : AlertCircle;
  const color = isPublished && !isStale ? 'text-emerald-400' : isStale ? 'text-orange-400' : 'text-slate-400';
  return (
    <section id="perf-signoff" className="ix-card p-4 scroll-mt-20">
      <PanelHeader title="Sign-off Status" collapsed={collapsed} onToggleCollapse={toggleCollapse} onHide={hide} />
      {!collapsed && (
        <div className="flex items-center gap-3">
          <Icon size={18} className={color} />
          <span className="text-sm text-slate-300">
            {isPublished
              ? `Published ${block.days_stale} days ago`
              : 'Draft — not yet published'}
          </span>
        </div>
      )}
    </section>
  );
}
