'use client';
import { useState } from 'react';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import { useGallery } from './gallery-provider';
import { bulkMoveAssetsAction } from '../actions';

export type MoveTarget = {
  buildingCode: string;
  listingId: string | null;        // null = General Building Area
  label: string;
};

export function MoveToUnitModal({
  open,
  onClose,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  targets: MoveTarget[];
}) {
  const { selection, clearSelection } = useGallery();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<MoveTarget | null>(null);

  if (!open) return null;

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bulkMoveAssetsAction({
        ids: Array.from(selection),
        targetBuildingCode: picked.buildingCode,
        targetListingId: picked.listingId,
      });
      if (result.failed.length > 0) {
        setError(`${result.ok.length} moved, ${result.failed.length} failed.`);
      } else {
        clearSelection();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'move_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Move {selection.size} item{selection.size === 1 ? '' : 's'} to:</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={16} /></button>
        </header>
        <div className="max-h-72 overflow-y-auto space-y-1 mb-3 -mx-2 px-2">
          {targets.map(t => (
            <button
              key={`${t.buildingCode}/${t.listingId || 'general'}`}
              onClick={() => setPicked(t)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                picked?.buildingCode === t.buildingCode && picked?.listingId === t.listingId
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!picked || busy}
            className="ix-btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
