import type { PhotoCategory } from './photo-categories';
import { PHOTO_CATEGORY_PRIORITY } from './photo-categories';

// Smart photo selection for the catalogue grid preview, catalogue
// detail hero+thumbs, and PDF spec sheet. Guarantees variety by
// filling priority slots: 1 full_boat (hero) + 1 seating + 1 interior
// + 1 bathroom + 1 filler.
//
// Within each category, photos are picked in their input order — so
// the caller is expected to have already sorted by (is_primary desc,
// sort_order asc). is_primary always wins as the hero slot.

export type PickerPhoto = {
  storage_path: string;
  category: PhotoCategory | null;
  is_primary?: boolean;
  // Allow callers to attach extra fields (id, url, etc) — they survive
  // the picker and come out in order.
  [key: string]: unknown;
};

// Priority slot order for the showcase: full_boat first (hero), then
// the next 3 categories, then filler. Mirrors PHOTO_CATEGORY_PRIORITY
// but dropped the trailing 'other' since it's the implicit filler.
const SLOT_CATEGORIES: PhotoCategory[] = ['full_boat', 'seating', 'interior', 'bathroom'];

// Picks `count` photos in showcase order. Algorithm:
//   1. If any photo has is_primary=true, that one becomes the hero.
//      Otherwise the first slot is filled with the best full_boat (or
//      whichever priority slot is non-empty first).
//   2. Walk the priority slots, picking one photo per category that
//      isn't already used.
//   3. Backfill remaining slots from the leftover pool, preferring
//      higher-priority categories.
//
// Returns at most `count` photos. Won't fabricate — if a boat only has
// 2 photos, you get 2 back.
export function pickShowcasePhotos<T extends PickerPhoto>(
  photos: T[],
  count: number
): T[] {
  if (photos.length === 0 || count <= 0) return [];

  const used = new Set<T>();
  const out: T[] = [];

  // Group photos by category. 'null' (untagged) lives under 'other'
  // for picker purposes — we don't want to lose them entirely.
  const byCategory = new Map<PhotoCategory, T[]>();
  for (const cat of PHOTO_CATEGORY_PRIORITY) byCategory.set(cat, []);
  for (const p of photos) {
    const cat: PhotoCategory = p.category ?? 'other';
    byCategory.get(cat)!.push(p);
  }

  // Slot 0 (hero): admin-pinned primary wins, otherwise best full_boat,
  // otherwise walk priority categories until something is found.
  const primary = photos.find(p => p.is_primary);
  if (primary) {
    out.push(primary);
    used.add(primary);
  } else {
    for (const cat of PHOTO_CATEGORY_PRIORITY) {
      const candidate = byCategory.get(cat)!.find(p => !used.has(p));
      if (candidate) {
        out.push(candidate);
        used.add(candidate);
        break;
      }
    }
  }

  // Remaining priority slots — one per category in SLOT_CATEGORIES,
  // skipping whatever the hero already covered.
  for (const cat of SLOT_CATEGORIES) {
    if (out.length >= count) break;
    const candidate = byCategory.get(cat)!.find(p => !used.has(p));
    if (candidate) {
      out.push(candidate);
      used.add(candidate);
    }
  }

  // Backfill: walk priority categories again, adding any leftover
  // photos until we hit `count` or run out of photos.
  for (const cat of PHOTO_CATEGORY_PRIORITY) {
    if (out.length >= count) break;
    for (const p of byCategory.get(cat)!) {
      if (out.length >= count) break;
      if (used.has(p)) continue;
      out.push(p);
      used.add(p);
    }
  }

  return out;
}

// Single-photo convenience — used by the catalogue grid preview.
export function pickPreviewPhoto<T extends PickerPhoto>(photos: T[]): T | null {
  const picks = pickShowcasePhotos(photos, 1);
  return picks[0] ?? null;
}
