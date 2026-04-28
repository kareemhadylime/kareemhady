'use client';

import { useState } from 'react';
import {
  Warehouse, ChevronDown, ChevronRight, Edit3, Power, KeyRound, Plus, MapPin,
} from 'lucide-react';
import type { WarehouseTreeNode } from '@/lib/beithady/inventory/warehouses';
import { CATEGORY_TAG_LABEL } from '@/lib/beithady/inventory/warehouses';
import { WarehouseFormButton } from './warehouse-form-button';
import { toggleWarehouseActiveAction, rotatePinAction } from '../actions';

type StatsMap = Record<string, { item_count: number; stock_value_egp: number }>;
type ParentOption = { id: string; code: string; name_en: string; building_code: string | null };

const CATEGORY_COLOR: Record<string, string> = {
  general: 'bg-slate-100 text-slate-700',
  linen: 'bg-violet-50 text-violet-700',
  fnb: 'bg-amber-50 text-amber-700',
  chemicals: 'bg-rose-50 text-rose-700',
  maintenance: 'bg-cyan-50 text-cyan-700',
  welcome_tray: 'bg-emerald-50 text-emerald-700',
};

export function WarehouseTreePanel({
  node, stats, pin, canWrite, allMainsForParent,
}: {
  node: WarehouseTreeNode;
  stats: StatsMap;
  pin: string | null;
  canWrite: boolean;
  allMainsForParent: ParentOption[];
}) {
  const [expanded, setExpanded] = useState(true);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stat = stats[node.id];
  const childCount = node.children.length;
  const isMain = node.parent_id === null;

  async function handleToggle() {
    if (!confirm(`${node.active ? 'Deactivate' : 'Activate'} "${node.name_en}"?`)) return;
    setToggleBusy(true);
    setError(null);
    try {
      const res = await toggleWarehouseActiveAction(node.id);
      if (!res.ok) setError(res.error);
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleRotatePin() {
    if (!confirm(`Generate a new PIN for ${node.code}? The old PIN will stop working immediately.`)) return;
    setPinBusy(true);
    setError(null);
    try {
      const res = await rotatePinAction(node.code);
      if (res.ok) setRevealedPin(res.pin);
      else setError(res.error);
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="ix-card p-3 space-y-2">
      {/* Main header row */}
      <div className="flex items-start gap-2">
        {childCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-0.5 p-0.5 rounded hover:bg-slate-100"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="mt-0.5 w-[18px]" aria-hidden />
        )}

        <Warehouse
          size={16}
          className={node.active ? 'text-emerald-600 mt-0.5' : 'text-slate-300 mt-0.5'}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: 'var(--bh-navy)' }}>
              {node.name_en}
            </span>
            <code className="text-[10px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
              {node.code}
            </code>
            {node.category_tag && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLOR[node.category_tag]}`}>
                {CATEGORY_TAG_LABEL[node.category_tag].en}
              </span>
            )}
            {!node.active && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-medium">
                Inactive
              </span>
            )}
            {childCount > 0 && (
              <span className="text-[10px] text-slate-500">
                {childCount} sub-warehouse{childCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5" dir="rtl">
            {node.name_ar}
          </div>
          {node.notes && (
            <div className="text-[11px] text-slate-500 mt-1 italic line-clamp-2">{node.notes}</div>
          )}
          {node.address_line && (
            <div className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1">
              <MapPin size={10} /> {node.address_line}
            </div>
          )}
        </div>

        {/* Stats column */}
        <div className="text-right text-[11px] tabular-nums">
          <div className="text-slate-500">
            {stat?.item_count ?? 0} item{(stat?.item_count ?? 0) === 1 ? '' : 's'}
          </div>
          <div className="font-semibold text-slate-700">
            {stat?.stock_value_egp
              ? `${stat.stock_value_egp.toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP`
              : '0 EGP'}
          </div>
        </div>
      </div>

      {/* Action row */}
      {canWrite && (
        <div className="flex items-center gap-2 flex-wrap pl-7 pt-1 border-t border-slate-100">
          <WarehouseFormButton
            mode="edit"
            existing={node}
            triggerLabel={
              <>
                <Edit3 size={12} /> Edit
              </>
            }
            triggerClass="text-[11px] text-slate-600 hover:text-cyan-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-50"
            allMains={allMainsForParent}
          />
          {isMain && (
            <WarehouseFormButton
              mode="create_sub"
              parentId={node.id}
              parentBuildingCode={node.building_code}
              triggerLabel={
                <>
                  <Plus size={12} /> Add sub-warehouse
                </>
              }
              triggerClass="text-[11px] text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-emerald-50"
              allMains={allMainsForParent}
            />
          )}
          {isMain && (
            <button
              type="button"
              onClick={handleRotatePin}
              disabled={pinBusy}
              className="text-[11px] text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-50 disabled:opacity-50"
              title="Generate a new building PIN for the mobile cleaner app"
            >
              <KeyRound size={12} /> {pinBusy ? 'Rotating…' : 'Rotate PIN'}
            </button>
          )}
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggleBusy}
            className={`text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded disabled:opacity-50 ml-auto ${
              node.active
                ? 'text-rose-700 hover:bg-rose-50'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <Power size={12} /> {toggleBusy ? '…' : node.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      )}

      {/* PIN reveal banner */}
      {revealedPin && isMain && (
        <div className="ml-7 ix-card border-amber-300 bg-amber-50 p-3 text-xs">
          <div className="font-semibold text-amber-900 mb-1">New PIN for {node.code}</div>
          <div className="font-mono text-2xl tracking-widest text-amber-900">{revealedPin}</div>
          <div className="text-[11px] text-amber-700 mt-1">
            Share this with cleaners. The old PIN no longer works.
          </div>
        </div>
      )}

      {pin && !revealedPin && isMain && (
        <div className="ml-7 text-[11px] text-slate-500 inline-flex items-center gap-1">
          <KeyRound size={10} /> Mobile PIN: <span className="font-mono">••••••</span>{' '}
          <span className="text-slate-400">(rotate to reveal)</span>
        </div>
      )}

      {error && <div className="ml-7 text-[11px] text-rose-700">{error}</div>}

      {/* Children */}
      {expanded && childCount > 0 && (
        <div className="ml-7 space-y-2 border-l-2 border-slate-100 pl-3">
          {node.children.map(child => (
            <WarehouseTreePanel
              key={child.id}
              node={child}
              stats={stats}
              pin={null}
              canWrite={canWrite}
              allMainsForParent={allMainsForParent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
