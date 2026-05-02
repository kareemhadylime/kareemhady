'use client';
import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { nukeAlbumAction } from '../actions';

export function NukeAlbumButton({
  buildingCode,
  listingId,
  unitTemplateId,
  totalAssets,
  albumLabel,
}: {
  buildingCode: string;
  listingId: string | null;
  unitTemplateId?: string | null;
  totalAssets: number;
  albumLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (totalAssets === 0) return null;

  const canConfirm = confirmText === 'DELETE';

  async function doNuke() {
    setBusy(true);
    setError(null);
    try {
      const result = await nukeAlbumAction({
        buildingCode,
        listingId,
        unitTemplateId: unitTemplateId || null,
        confirmation: 'DELETE',
      });
      if (!result.ok) {
        setError(result.error || 'nuke_failed');
      } else {
        setOpen(false);
        setConfirmText('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'nuke_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-secondary text-xs inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
      >
        <Trash2 size={12} /> Wipe album
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="ix-card max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2 text-rose-700 dark:text-rose-300">
              Delete all {totalAssets} item{totalAssets === 1 ? '' : 's'} in {albumLabel}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              This soft-deletes every asset in this folder. Ad-eligible items are removed from the public CDN.
              Items can be recovered from the database for ~30 days.
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-200 mb-1">
              Type <code className="font-bold">DELETE</code> to confirm:
            </p>
            <input
              type="text"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="ix-input w-full text-sm mb-3 font-mono"
              disabled={busy}
            />
            {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setOpen(false)} className="ix-btn-secondary text-xs" disabled={busy}>Cancel</button>
              <button
                onClick={doNuke}
                disabled={!canConfirm || busy}
                className="ix-btn-danger text-xs inline-flex items-center gap-1 disabled:opacity-40"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete all {totalAssets}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
