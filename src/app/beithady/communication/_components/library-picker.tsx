'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Image as ImageIcon, Loader2, Upload, CheckSquare, Square } from 'lucide-react';

// Phase Q.3 — listing library picker. 2-step modal:
//   1. Pick building (4 cards)
//   2. Pick listing (filtered to building)
//   3. Multi-select photos for that listing
// Submit returns selected attachments to parent via onConfirm.

export type LibraryAttachment = { url: string; name: string; mime: string };

type Listing = { listing_id: string; nickname: string | null; asset_count: number };
type Asset = { id: string; public_url: string; caption: string | null; mime_type: string | null };

const STEPS = ['building', 'listing', 'photos'] as const;
type Step = typeof STEPS[number];

export function LibraryPicker({
  buildingCode,
  onCancel,
  onConfirm,
  maxToAdd,
}: {
  buildingCode: string | null;
  onCancel: () => void;
  onConfirm: (items: LibraryAttachment[]) => void;
  maxToAdd: number;
}) {
  const [step, setStep] = useState<Step>(buildingCode ? 'listing' : 'building');
  const [building, setBuilding] = useState<string | null>(buildingCode);
  const [listingId, setListingId] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<{ building_code: string; listing_count: number; asset_count: number }[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Step 1: load buildings if no preselected building
  useEffect(() => {
    if (step !== 'building') return;
    setLoading(true);
    fetch('/api/beithady/communication/library/buildings')
      .then(r => r.json())
      .then(d => setBuildings(d.buildings || []))
      .catch(() => setBuildings([]))
      .finally(() => setLoading(false));
  }, [step]);

  // Step 2: load listings for the building
  useEffect(() => {
    if (step !== 'listing' || !building) return;
    setLoading(true);
    fetch(`/api/beithady/communication/library/listings?building=${encodeURIComponent(building)}`)
      .then(r => r.json())
      .then(d => setListings(d.listings || []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [step, building]);

  // Step 3: load assets for the listing
  useEffect(() => {
    if (step !== 'photos' || !listingId) return;
    setLoading(true);
    fetch(`/api/beithady/communication/library/assets?listing=${encodeURIComponent(listingId)}`)
      .then(r => r.json())
      .then(d => setAssets(d.assets || []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [step, listingId]);

  // Audit fix H-A15 / H-E4: reset `selected` when the listing changes.
  // Pre-fix, picking photos in listing A then forward-navigating to
  // listing B preserved the listing-A IDs in the Set — which silently
  // disappeared from the count because the new `assets` query returned
  // a different ID set. Operator's selection vanished.
  useEffect(() => {
    setSelected(new Set());
  }, [listingId]);

  const selectedAssets = useMemo(
    () => assets.filter(a => selected.has(a.id)),
    [assets, selected],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (next.size < maxToAdd) next.add(id);
    setSelected(next);
  };

  // "Select all" — pick everything currently visible up to maxToAdd.
  // If everything's already selected, clears the selection (toggle UX).
  const selectAll = () => {
    const visibleIds = assets.map(a => a.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds.slice(0, maxToAdd)));
    }
  };

  const confirm = () => {
    const items: LibraryAttachment[] = selectedAssets.map(a => ({
      url: a.public_url,
      name: a.caption || a.public_url.split('/').pop() || 'asset',
      mime: a.mime_type || 'image/jpeg',
    }));
    onConfirm(items);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {step !== 'building' && (
              <button
                type="button"
                onClick={() => {
                  if (step === 'photos') setStep('listing');
                  else setStep('building');
                  setSelected(new Set());
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <span className="font-semibold">Listing Library</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 text-xs">
              {step === 'building' && 'Choose a building'}
              {step === 'listing' && building}
              {step === 'photos' && `${building} · ${listings.find(l => l.listing_id === listingId)?.nickname || ''}`}
            </span>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="text-center py-12 text-sm text-slate-400 inline-flex items-center gap-2 mx-auto">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}

          {!loading && step === 'building' && (
            buildings.length === 0 ? (
              <EmptyHint message="No listing photos uploaded yet. Upload photos via Settings → Listing Library." />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {buildings.map(b => (
                  <button
                    key={b.building_code}
                    type="button"
                    onClick={() => { setBuilding(b.building_code); setStep('listing'); }}
                    className="ix-card p-4 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition text-left group"
                  >
                    <div className="text-base font-semibold">{b.building_code}</div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {b.listing_count} unit{b.listing_count === 1 ? '' : 's'} · {b.asset_count} photo{b.asset_count === 1 ? '' : 's'}
                    </div>
                    <ChevronRight size={14} className="text-slate-300 mt-1 group-hover:text-slate-500" />
                  </button>
                ))}
              </div>
            )
          )}

          {!loading && step === 'listing' && (
            listings.length === 0 ? (
              <EmptyHint message={`No listings with assets in ${building}.`} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {listings.map(l => (
                  <button
                    key={l.listing_id}
                    type="button"
                    onClick={() => { setListingId(l.listing_id); setStep('photos'); }}
                    disabled={l.asset_count === 0}
                    className="ix-card p-3 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-sm font-semibold truncate">{l.nickname || l.listing_id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {l.asset_count} photo{l.asset_count === 1 ? '' : 's'}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {!loading && step === 'photos' && (
            assets.length === 0 ? (
              <EmptyHint message="No photos uploaded for this unit yet." />
            ) : (
              <>
                {/* Select-all toolbar — one click picks the whole album
                    up to maxToAdd, or clears the selection if everything's
                    already picked. */}
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950 px-2 py-1 rounded transition"
                  >
                    {assets.length > 0 && assets.every(a => selected.has(a.id)) ? (
                      <><Square size={12} /> Clear selection</>
                    ) : (
                      <><CheckSquare size={12} /> Select all{assets.length > maxToAdd ? ` (${maxToAdd} max)` : ` (${assets.length})`}</>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    {assets.length} photo{assets.length === 1 ? '' : 's'} in this album
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                {assets.map(a => {
                  const isImg = (a.mime_type || '').startsWith('image/');
                  const sel = selected.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                        sel ? 'border-violet-500' : 'border-slate-200 dark:border-slate-700'
                      }`}
                      title={a.caption || ''}
                    >
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.public_url} alt={a.caption || 'asset'} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">
                          {a.mime_type || 'file'}
                        </div>
                      )}
                      {sel && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center font-bold">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
                </div>
              </>
            )
          )}
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {step === 'photos' && `${selected.size} selected · max ${maxToAdd}`}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="ix-btn-secondary text-xs">Cancel</button>
            {step === 'photos' && (
              <button
                type="button"
                onClick={confirm}
                disabled={selected.size === 0}
                className="ix-btn-primary text-xs disabled:opacity-50"
              >
                <ImageIcon size={11} /> Add {selected.size}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-sm text-slate-400">
      <Upload size={20} className="mx-auto mb-2 text-slate-300" />
      <div>{message}</div>
    </div>
  );
}
