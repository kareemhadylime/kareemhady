// Photo room-category inference. Used by the unit-folder page to
// group photos under "Bedrooms", "Bathrooms", "Kitchen", etc. Pulls
// from AI tags (Phase D Claude vision) + manual tags. The agent can
// also override by adding a manual tag like `bedroom` / `kitchen`.

export type RoomCategory =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'balcony'
  | 'exterior'
  | 'amenity'
  | 'other';

export const ROOM_CATEGORIES: RoomCategory[] = [
  'bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'balcony', 'exterior', 'amenity', 'other',
];

export const ROOM_LABELS: Record<RoomCategory, string> = {
  bedroom: 'Bedrooms',
  bathroom: 'Bathrooms',
  kitchen: 'Kitchen',
  living: 'Living areas',
  dining: 'Dining',
  balcony: 'Balcony / view',
  exterior: 'Exterior / building',
  amenity: 'Amenities',
  other: 'Other',
};

export const ROOM_EMOJI: Record<RoomCategory, string> = {
  bedroom: '🛏️',
  bathroom: '🛁',
  kitchen: '🍳',
  living: '🛋️',
  dining: '🍽️',
  balcony: '🌅',
  exterior: '🏢',
  amenity: '🏊',
  other: '📷',
};

const TAG_TO_CATEGORY: Record<string, RoomCategory> = {
  // bedrooms
  bedroom: 'bedroom', bedrooms: 'bedroom',
  master_bedroom: 'bedroom', master: 'bedroom',
  guest_bedroom: 'bedroom', guestroom: 'bedroom',
  king_bed: 'bedroom', queen_bed: 'bedroom', twin_bed: 'bedroom',
  bed: 'bedroom',
  // bathrooms
  bathroom: 'bathroom', bath: 'bathroom',
  shower: 'bathroom', toilet: 'bathroom', sink: 'bathroom',
  master_bath: 'bathroom', en_suite: 'bathroom', vanity: 'bathroom',
  // kitchen
  kitchen: 'kitchen', kitchenette: 'kitchen',
  oven: 'kitchen', stove: 'kitchen', fridge: 'kitchen',
  microwave: 'kitchen', dishwasher: 'kitchen', cookware: 'kitchen',
  // living
  living: 'living', living_room: 'living', lounge: 'living',
  sofa: 'living', tv: 'living', couch: 'living',
  // dining
  dining: 'dining', dining_room: 'dining', dining_table: 'dining',
  // balcony
  balcony: 'balcony', terrace: 'balcony', patio: 'balcony',
  view: 'balcony', sea_view: 'balcony', rooftop: 'balcony', outdoor: 'balcony',
  // exterior
  exterior: 'exterior', building: 'exterior', facade: 'exterior',
  entrance: 'exterior', lobby: 'exterior', street: 'exterior',
  // amenities
  pool: 'amenity', gym: 'amenity', spa: 'amenity', sauna: 'amenity',
  parking: 'amenity', elevator: 'amenity', laundry: 'amenity',
  reception: 'amenity', breakfast: 'amenity',
};

export function deriveRoomCategory(tags: { ai_tags?: string[] | null; manual_tags?: string[] | null }): RoomCategory {
  // Manual tags win over AI tags
  const all: string[] = [];
  for (const t of (tags.manual_tags || [])) all.push(String(t).toLowerCase().replace(/\s+/g, '_'));
  for (const t of (tags.ai_tags || [])) all.push(String(t).toLowerCase().replace(/\s+/g, '_'));
  for (const tag of all) {
    if (TAG_TO_CATEGORY[tag]) return TAG_TO_CATEGORY[tag];
    // Partial match (e.g. 'master_bedroom_2' → bedroom)
    for (const known of Object.keys(TAG_TO_CATEGORY)) {
      if (tag.includes(known)) return TAG_TO_CATEGORY[known];
    }
  }
  return 'other';
}

export function bucketAssetsByRoom<T extends { ai_tags?: string[] | null; manual_tags?: string[] | null }>(
  assets: T[]
): Record<RoomCategory, T[]> {
  const out: Record<RoomCategory, T[]> = {
    bedroom: [], bathroom: [], kitchen: [], living: [], dining: [],
    balcony: [], exterior: [], amenity: [], other: [],
  };
  for (const a of assets) {
    out[deriveRoomCategory(a)].push(a);
  }
  return out;
}
