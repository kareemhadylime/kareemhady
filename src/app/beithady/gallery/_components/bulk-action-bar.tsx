'use client';
import { useState, useTransition } from 'react';
import {
  X, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Tag, Megaphone, Trash2, Move, Loader2,
} from 'lucide-react';
import { useGallery, type AlbumKey } from './gallery-provider';
import {
  bulkDeleteAssetsAction, bulkTagAssetsAction, bulkAdEligibleAction,
  reorderAssetsAction,
} from '../actions';
import { MoveToUnitModal, type MoveTarget } from './move-to-unit-modal';

export function BulkActionBar({
  album,
  idsInOrder,
  moveTargets,
  allAdEligibleSelected,
}: {
  album: AlbumKey;
  idsInOrder: string[];
  moveTargets: MoveTarget[];
  allAdEligibleSelected: boolean;
}) {
  const { selection, selectionAlbum, clearSelection } = useGallery();
  const [busy, startTransition] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagInput, setTagInput] = useState<{ open: boolean; mode: 'add' | 'remove' }>({ open: false, mode: 'add' });
  const [tagText, setTagText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (selection.size === 0) return null;
  if (selectionAlbum) {
    const sameBuilding = selectionAlbum.building === album.building;
    const isTemplate = !!album.unitTemplateId || !!selectionAlbum.unitTemplateId;
    const sameAlbum = isTemplate
      ? sameBuilding && (selectionAlbum.unitTemplateId || null) === (album.unitTemplateId || null)
      : sameBuilding && selectionAlbum.listingId === album.listingId;
    if (!sameAlbum) return null;
  }

  const selectedIds = Array.from(selection);

  function reorderTo(positionOf: 'start' | 'end' | 'up' | 'down') {
    const selSet = new Set(selectedIds);
    const moving = idsInOrder.filter(id => selSet.has(id));
    const remaining = idsInOrder.filter(id => !selSet.has(id));
    let next: string[];

    if (positionOf === 'start') {
      next = [...moving, ...remaining];
    } else if (positionOf === 'end') {
      next = [...remaining, ...moving];
    } else {
      const firstSelIdx = idsInOrder.findIndex(id => selSet.has(id));
      const lastSelIdx = idsInOrder.length - 1 - [...idsInOrder].reverse().findIndex(id => selSet.has(id));
      let insertAt: number;
      if (positionOf === 'up') {
        insertAt = Math.max(0, firstSelIdx - 1);
      } else {
        insertAt = Math.min(remaining.length, lastSelIdx - moving.length + 2);
      }
      next = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
    }

    startTransition(async () => {
      const result = await reorderAssetsAction({
        buildingCode: album.building,
        listingId: album.listingId,
        unitTemplateId: album.unitTemplateId || null,
        orderedIds: next,
      });
      if (!result.ok) setError(result.error || 'reorder_failed');
    });
  }

  function doDelete() {
    if (!confirm(`Delete ${selection.size} item${selection.size === 1 ? '' : 's'}? They can be recovered from the database for ~30 days.`)) return;
    startTransition(async () => {
      const result = await bulkDeleteAssetsAction({ ids: selectedIds });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} deleted, ${result.failed.length} failed.`);
      } else {
        clearSelection();
      }
    });
  }

  function doAdEligible() {
    const target = !allAdEligibleSelected;
    startTransition(async () => {
      const result = await bulkAdEligibleAction({ ids: selectedIds, eligible: target });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} updated, ${result.failed.length} failed.`);
      }
    });
  }

  function submitTags() {
    const tags = tagText.split(/[,\s]+/).map(t => t.toLowerCase().trim()).filter(Boolean);
    if (tags.length === 0) { setTagInput({ open: false, mode: 'add' }); setTagText(''); return; }
    startTransition(async () => {
      const result = await bulkTagAssetsAction({
        ids: selectedIds,
        addTags: tagInput.mode === 'add' ? tags : [],
        removeTags: tagInput.mode === 'remove' ? tags : [],
      });
      if (result.failed.length > 0) setError(`${result.ok.length} updated, ${result.failed.length} failed.`);
      setTagInput({ open: false, mode: 'add' });
      setTagText('');
    });
  }

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 ix-card shadow-xl px-3 py-2 flex items-center gap-2 max-w-[calc(100vw-2rem)] flex-wrap">
        <span className="text-xs font-semibold tabular-nums px-2">
          {selection.size} selected
          {busy && <Loader2 size={11} className="inline ml-1 animate-spin text-blue-500" />}
        </span>

        <div className="flex items-center gap-0.5 border-l border-slate-200 dark:border-slate-700 pl-2">
          <button onClick={() => reorderTo('up')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move up"><ArrowUp size={12} /></button>
          <button onClick={() => reorderTo('down')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move down"><ArrowDown size={12} /></button>
          <button onClick={() => reorderTo('start')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move to start"><ChevronsUp size={12} /></button>
          <button onClick={() => reorderTo('end')} disabled={busy} className="ix-btn-ghost p-1.5" title="Move to end"><ChevronsDown size={12} /></button>
        </div>

        <button onClick={() => setMoveOpen(true)} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Move size={12} /> Move to…
        </button>

        <button onClick={() => setTagInput({ open: true, mode: 'add' })} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Tag size={12} /> Tag…
        </button>

        <button onClick={doAdEligible} disabled={busy} className="ix-btn-secondary text-xs inline-flex items-center gap-1">
          <Megaphone size={12} /> {allAdEligibleSelected ? 'Demote from ads' : 'Mark ad-eligible'}
        </button>

        <button onClick={doDelete} disabled={busy} className="ix-btn-danger text-xs inline-flex items-center gap-1">
          <Trash2 size={12} /> Delete {selection.size}
        </button>

        <button onClick={clearSelection} disabled={busy} className="ix-btn-ghost text-xs inline-flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 ml-1">
          <X size={12} /> Clear
        </button>
      </div>

      {error && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 ix-card shadow-lg px-3 py-2 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <MoveToUnitModal open={moveOpen} onClose={() => setMoveOpen(false)} targets={moveTargets} />

      {tagInput.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setTagInput({ open: false, mode: 'add' })}>
          <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">
              {tagInput.mode === 'add' ? 'Add tags to' : 'Remove tags from'} {selection.size} item{selection.size === 1 ? '' : 's'}
            </h3>
            <div className="flex gap-2 text-xs mb-2">
              <button
                onClick={() => setTagInput({ ...tagInput, mode: 'add' })}
                className={`px-2 py-0.5 rounded ${tagInput.mode === 'add' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >Add</button>
              <button
                onClick={() => setTagInput({ ...tagInput, mode: 'remove' })}
                className={`px-2 py-0.5 rounded ${tagInput.mode === 'remove' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              >Remove</button>
            </div>
            <input
              type="text"
              autoFocus
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitTags(); }}
              placeholder="hero_shot, favorite, keep_off_ads"
              className="ix-input w-full text-sm mb-3"
            />
            <p className="text-[10px] text-slate-500 mb-3">Comma- or space-separated. Lowercased server-side.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setTagInput({ open: false, mode: 'add' }); setTagText(''); }} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
              <button onClick={submitTags} className="ix-btn-primary text-xs" disabled={busy || !tagText.trim()}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
