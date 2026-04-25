'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Hero photo + thumbnail strip + click-to-open lightbox modal.
// Lightbox supports: arrow keys, ESC, swipe (mobile), backdrop click,
// photo counter. No external lib.

type Photo = { url: string; alt: string };

export function CataloguePhotoGallery({ photos }: { photos: Photo[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const open = openIndex !== null;

  if (photos.length === 0) return null;
  const hero = photos[0];
  const thumbs = photos.slice(1, 5);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setOpenIndex(0)}
          className="relative aspect-[4/3] md:col-span-2 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
          aria-label={`Open ${hero.alt} fullscreen`}
        >
          <Image
            src={hero.url}
            alt={hero.alt}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 66vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        </button>
        <div className="grid grid-cols-2 gap-3">
          {thumbs.map((p, i) => (
            <button
              key={p.url}
              type="button"
              onClick={() => setOpenIndex(i + 1)}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group"
              aria-label={`Open ${p.alt} fullscreen`}
            >
              <Image
                src={p.url}
                alt={p.alt}
                fill
                unoptimized
                sizes="(max-width: 768px) 50vw, 17vw"
                className="object-cover group-hover:scale-[1.05] transition-transform duration-500"
              />
            </button>
          ))}
          {/* "+N more" tile if there are more than 5 photos */}
          {photos.length > 5 && (
            <button
              type="button"
              onClick={() => setOpenIndex(5)}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition col-span-2"
            >
              +{photos.length - 5} more photos
            </button>
          )}
        </div>
      </div>

      {open && (
        <Lightbox
          photos={photos}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);

  const prev = () => setIndex(i => (i - 1 + photos.length) % photos.length);
  const next = () => setIndex(i => (i + 1) % photos.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    // Lock body scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = photos[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.alt}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) {
          if (dx > 0) prev();
          else next();
        }
        touchStartX.current = null;
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
      >
        <X size={20} />
      </button>

      <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-semibold">
        {index + 1} / {photos.length}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={e => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-2 sm:left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <ChevronLeft size={28} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={e => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-2 sm:right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      <div
        className="relative w-full h-full max-w-[95vw] max-h-[90vh] flex items-center justify-center p-4"
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
