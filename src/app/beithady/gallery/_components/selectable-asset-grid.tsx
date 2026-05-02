'use client';
import Link from 'next/link';
import { useRef, useState, useTransition, useEffect } from 'react';
import {
  DndContext, type DragEndEvent, DragOverlay, type DragStartEvent, PointerSensor,
  TouchSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, Video, Megaphone, Sparkles, Image as ImageIcon, Check, GripVertical } from 'lucide-react';
import type { GalleryAsset } from '@/lib/beithady/gallery/gallery-list';
import { useGallery, type AlbumKey } from './gallery-provider';
import { reorderAssetsAction } from '../actions';

export type AssetWithUrl = { asset: GalleryAsset; url: string | null };

export function SelectableAssetGrid({
  items: serverItems,
  album,
  detailHrefBase,
}: {
  items: AssetWithUrl[];
  album: AlbumKey;
  detailHrefBase: string;
}) {
  const { selection, isSelected, toggleSelected, selectRange } = useGallery();
  const lastClickedRef = useRef<string | null>(null);
  // Optimistic local order; reverts on server error.
  const [items, setItems] = useState<AssetWithUrl[]>(serverItems);
  const [savedSnapshot, setSavedSnapshot] = useState<AssetWithUrl[]>(serverItems);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sync from server on revalidation
  useEffect(() => {
    const sameLength = serverItems.length === savedSnapshot.length;
    const sameOrder = sameLength && serverItems.every((s, i) => s.asset.id === savedSnapshot[i]?.asset.id);
    if (!sameOrder) {
      setItems(serverItems);
      setSavedSnapshot(serverItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (items.length === 0) {
    return (
      <div className="ix-card p-10 text-center text-sm text-slate-500">
        <ImageIcon size={24} className="mx-auto text-slate-300 mb-2" />
        No assets yet. Upload some via the panel above.
      </div>
    );
  }

  const idsInOrder = items.map(i => i.asset.id);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(i => i.asset.id === active.id);
    const newIndex = items.findIndex(i => i.asset.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    // If dragged tile is in the selection AND there are 2+ selected,
    // move the entire selected group as a contiguous block.
    let nextItems: AssetWithUrl[];
    if (selection.size >= 2 && selection.has(String(active.id))) {
      const selectedSet = selection;
      const moving = items.filter(i => selectedSet.has(i.asset.id));
      const remaining = items.filter(i => !selectedSet.has(i.asset.id));
      const overIdInRemaining = remaining.findIndex(i => i.asset.id === over.id);
      const insertAt = overIdInRemaining >= 0 ? overIdInRemaining : remaining.length;
      nextItems = [
        ...remaining.slice(0, insertAt),
        ...moving,
        ...remaining.slice(insertAt),
      ];
    } else {
      nextItems = arrayMove(items, oldIndex, newIndex);
    }

    setItems(nextItems);
    const newOrderedIds = nextItems.map(i => i.asset.id);
    startTransition(async () => {
      const result = await reorderAssetsAction({
        buildingCode: album.building,
        listingId: album.listingId,
        orderedIds: newOrderedIds,
      });
      if (!result.ok) {
        setItems(savedSnapshot);
      } else {
        setSavedSnapshot(nextItems);
      }
    });
  }

  const activeItem = activeId ? items.find(i => i.asset.id === activeId) : null;
  const activeIsInSelection = activeId ? selection.has(activeId) && selection.size >= 2 : false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={idsInOrder} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {items.map(({ asset, url }) => {
            const sel = isSelected(asset.id);
            return (
              <SortableAssetCard
                key={asset.id}
                asset={asset}
                url={url}
                selected={sel}
                anySelected={selection.size > 0}
                detailHrefBase={detailHrefBase}
                onCheckboxClick={(e) => {
                  if (e.shiftKey && lastClickedRef.current && lastClickedRef.current !== asset.id) {
                    selectRange(lastClickedRef.current, asset.id, idsInOrder, album);
                  } else {
                    toggleSelected(asset.id, album);
                    lastClickedRef.current = asset.id;
                  }
                }}
              />
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <div className="ix-card overflow-hidden shadow-2xl scale-105 ring-2 ring-blue-500">
            <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative">
              {activeItem.url && activeItem.asset.mime_type?.startsWith('image/') && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={activeItem.url} alt="" className="w-full h-full object-cover" />
              )}
              {activeIsInSelection && (
                <span className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center">
                  {selection.size}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableAssetCard(props: {
  asset: GalleryAsset;
  url: string | null;
  selected: boolean;
  anySelected: boolean;
  detailHrefBase: string;
  onCheckboxClick: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.asset.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const { asset, url, selected, anySelected, detailHrefBase, onCheckboxClick } = props;
  const href = `${detailHrefBase}?asset=${asset.id}`;
  const tagPreview = (asset.manual_tags.length ? asset.manual_tags : asset.ai_tags).slice(0, 2);
  const totalTags = asset.manual_tags.length + asset.ai_tags.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ix-card overflow-hidden transition ${
        selected ? 'ring-2 ring-blue-500 shadow-md' : 'hover:shadow-md'
      }`}
    >
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCheckboxClick(e); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded border flex items-center justify-center transition ${
          selected
            ? 'bg-blue-500 border-blue-500 text-white'
            : `bg-white/90 border-slate-300 ${anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
        }`}
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected && <Check size={12} />}
      </button>

      <button
        {...attributes}
        {...listeners}
        className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition flex items-center justify-center cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        onClick={(e) => e.preventDefault()}
      >
        <GripVertical size={11} />
      </button>

      <Link href={href} className="block" onPointerDown={(e) => e.stopPropagation()}>
        <div className="aspect-square bg-stone-100 dark:bg-slate-900 relative overflow-hidden">
          {url && asset.mime_type?.startsWith('image/') ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={url} alt={asset.ai_caption || asset.file_name || ''} className="w-full h-full object-cover group-hover:scale-105 transition" draggable={false} />
          ) : url && asset.mime_type?.startsWith('video/') ? (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white">
              <Video size={32} />
              {asset.duration_sec && <span className="absolute bottom-2 right-2 text-xs bg-black/70 px-1.5 py-0.5 rounded">{asset.duration_sec}s</span>}
            </div>
          ) : asset.mime_type === 'application/pdf' || asset.category === 'document' ? (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              <FileText size={32} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <ImageIcon size={32} />
            </div>
          )}

          {asset.ad_eligible && (
            <span className="absolute top-7 right-1 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500 text-white shadow">
              <Megaphone size={10} /> Ad
            </span>
          )}
          {typeof asset.ai_quality_score === 'number' && asset.ai_quality_score > 0 && (
            <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-black/70 text-white">
              <Sparkles size={9} /> {asset.ai_quality_score}
            </span>
          )}
          {tagPreview.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] flex items-center gap-1 flex-wrap opacity-0 group-hover:opacity-100 transition">
              {tagPreview.map(t => (
                <span key={t} className="px-1 rounded bg-white/20">{t}</span>
              ))}
              {totalTags > tagPreview.length && (
                <span className="opacity-70">+{totalTags - tagPreview.length}</span>
              )}
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="text-xs truncate text-slate-700 dark:text-slate-200" title={asset.ai_caption || asset.file_name || ''}>
            {asset.ai_caption || asset.file_name || '(unnamed)'}
          </div>
          {!asset.ai_processed_at && asset.category === 'photo' && (
            <div className="text-[9px] text-amber-600 mt-0.5 inline-flex items-center gap-0.5">
              <Sparkles size={8} /> AI labeling…
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
