// Photo category constants — safe to import from client components.
// Kept separate from photo-classifier.ts (which is server-only because
// it uses the Anthropic SDK).

export const PHOTO_CATEGORIES = [
  'full_boat',
  'seating',
  'interior',
  'bathroom',
  'other',
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];

export const PHOTO_CATEGORY_LABEL: Record<PhotoCategory, string> = {
  full_boat: 'Full Boat',
  seating:   'Seating',
  interior:  'Interior',
  bathroom:  'Bathroom',
  other:     'Other',
};

// Marketing priority — drives the showcase picker. Lower index = higher
// priority. Used both for filling priority slots and ordering fillers.
export const PHOTO_CATEGORY_PRIORITY: PhotoCategory[] = [
  'full_boat',
  'seating',
  'interior',
  'bathroom',
  'other',
];
