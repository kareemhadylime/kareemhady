// Predefined boat-feature catalogue. Stored on
// boat_rental_boats.features as a string[] of these codes. Anything
// not in this list goes in features_md (free text).
//
// Adding/removing a feature is just a change here — no DB migration.
// Codes must stay stable once a boat has them stored; rename labels
// freely but don't repurpose codes.

export type FeatureCategory = 'always' | 'on_demand';

export type FeatureDef = {
  code: string;
  label: string;
  category: FeatureCategory;
};

export const BOAT_FEATURES: FeatureDef[] = [
  // Always-included
  { code: 'sunbath_front_seat', label: 'Sunbath Front Seat',          category: 'always' },
  { code: 'full_kitchen',       label: 'Full Kitchen',                category: 'always' },
  { code: 'microwave',          label: 'Microwave',                   category: 'always' },
  { code: 'coffee',             label: 'Coffee',                      category: 'always' },
  { code: 'refrigerator',       label: 'Refrigerator',                category: 'always' },
  { code: 'full_bathroom',      label: 'Full Bathroom',               category: 'always' },
  { code: 'fresh_water',        label: 'Fresh Water',                 category: 'always' },
  { code: 'shower',             label: 'Shower',                      category: 'always' },
  { code: 'under_deck_lounge',  label: 'Under Deck Lounge',           category: 'always' },
  { code: 'life_jackets',       label: 'Life Jackets',                category: 'always' },
  { code: 'snorkeling_gear',    label: 'Snorkeling Gear (Max 5)',     category: 'always' },
  { code: 'towels',             label: 'Towels',                      category: 'always' },
  // On demand / chargeable
  { code: 'beverages',          label: 'Beverages',                   category: 'on_demand' },
  { code: 'ice',                label: 'Ice',                         category: 'on_demand' },
  { code: 'snacks',             label: 'Snacks',                      category: 'on_demand' },
];

const BY_CODE = new Map(BOAT_FEATURES.map(f => [f.code, f]));

export function getFeature(code: string): FeatureDef | undefined {
  return BY_CODE.get(code);
}

export function isValidFeatureCode(code: string): boolean {
  return BY_CODE.has(code);
}

export function partitionFeatures(codes: string[]): {
  always: FeatureDef[];
  onDemand: FeatureDef[];
  unknown: string[];
} {
  const always: FeatureDef[] = [];
  const onDemand: FeatureDef[] = [];
  const unknown: string[] = [];
  // Preserve catalogue order (not selection order) for consistent display.
  const set = new Set(codes);
  for (const f of BOAT_FEATURES) {
    if (!set.has(f.code)) continue;
    if (f.category === 'always') always.push(f);
    else onDemand.push(f);
  }
  for (const c of codes) if (!BY_CODE.has(c)) unknown.push(c);
  return { always, onDemand, unknown };
}
