// Phase M.16 — volumetric helpers for the consumption math.
//
// Mass:    g, kg
// Volume:  ml, L
// Count:   pcs, pack, sachet, pair, bottle, can, box, roll
//
// "Compatible" UoMs are ones that share the same measure_kind. You can
// convert g→kg or ml→L freely; you CANNOT convert ml→g without knowing
// density. Same-measure conversion uses fixed factors below.

export type Uom = 'g' | 'kg' | 'ml' | 'L' | 'pcs' | 'pack' | 'sachet' | 'pair' | 'bottle' | 'can' | 'box' | 'roll';

export type MeasureKind = 'mass' | 'volume' | 'count';

const UOM_KIND: Record<string, MeasureKind> = {
  g: 'mass', kg: 'mass',
  ml: 'volume', L: 'volume', l: 'volume',
  pcs: 'count', pack: 'count', sachet: 'count', pair: 'count',
  bottle: 'count', can: 'count', box: 'count', roll: 'count',
};

// Conversion factors to a base unit per kind:
//   mass base = g       (kg → 1000 g)
//   volume base = ml    (L → 1000 ml)
//   count base = 1 unit
const TO_BASE: Record<string, number> = {
  g: 1, kg: 1000,
  ml: 1, L: 1000, l: 1000,
  pcs: 1, pack: 1, sachet: 1, pair: 1,
  bottle: 1, can: 1, box: 1, roll: 1,
};

export function uomKind(uom: string | null | undefined): MeasureKind | null {
  if (!uom) return null;
  return UOM_KIND[uom] || UOM_KIND[uom.toLowerCase()] || null;
}

export function areUomsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = uomKind(a);
  const kb = uomKind(b);
  return !!(ka && kb && ka === kb);
}

/**
 * Convert a value from one UoM to another within the same measure kind.
 * Returns null if the UoMs are incompatible (e.g. ml → g).
 *   convertVolume(4, 'kg', 'g')   → 4000
 *   convertVolume(100, 'ml', 'L') → 0.1
 *   convertVolume(1, 'L', 'g')    → null (incompatible)
 */
export function convertVolume(
  value: number,
  fromUom: string,
  toUom: string,
): number | null {
  if (!areUomsCompatible(fromUom, toUom)) return null;
  const f = TO_BASE[fromUom] ?? TO_BASE[fromUom.toLowerCase()];
  const t = TO_BASE[toUom] ?? TO_BASE[toUom.toLowerCase()];
  if (f == null || t == null) return null;
  return (value * f) / t;
}

/**
 * Parse a volumetric token from any free-text label.
 *   "Raid 300 ML"           → { value: 300, uom: 'ml' }
 *   "Clorel 4 kg"           → { value: 4, uom: 'kg' }
 *   "Frida 4 litre"         → { value: 4, uom: 'L' }
 *   "Toilet paper 12-pack"  → { value: 12, uom: 'pack' }
 *   "Pen"                   → null (no volume)
 * Used by the sourcer (Amazon name) and the items-page mismatch banner.
 */
export function parseVolumeFromText(
  text: string | null | undefined,
): { value: number; uom: Uom } | null {
  if (!text || typeof text !== 'string') return null;
  const normalized = text
    .toLowerCase()
    .replace(/litres?|liters?/g, 'l')
    .replace(/millilitres?|milliliters?/g, 'ml')
    .replace(/grams?/g, 'g')
    .replace(/kilograms?/g, 'kg');

  // Mass + volume tokens (ordered: longer first, so 'kg' beats 'g', 'ml' beats 'l')
  const massVol = normalized.match(/\b(\d+(?:\.\d+)?)\s*(kg|ml|g|l)\b/);
  if (massVol) {
    const value = Number(massVol[1]);
    let uom = massVol[2] as Uom;
    if (uom as string === 'l') uom = 'L';
    if (Number.isFinite(value) && value > 0) return { value, uom };
  }

  // Count-style packs ("pack of N", "N-pack", "Pack of 6")
  const packOf = normalized.match(/\bpack\s+of\s+(\d+)\b/);
  if (packOf) {
    const value = Number(packOf[1]);
    if (Number.isFinite(value) && value > 0) return { value, uom: 'pack' };
  }
  const nPack = normalized.match(/\b(\d+)[-\s]?(?:pack|pk)\b/);
  if (nPack) {
    const value = Number(nPack[1]);
    if (Number.isFinite(value) && value > 0) return { value, uom: 'pack' };
  }

  return null;
}

/**
 * Heart of the new estimator: given a rule's per-formula-trigger
 * consumption (e.g. 100 ml per check-in per bathroom) and the item's
 * actual pack volume (e.g. 4 L bottle), how many PURCHASABLE UNITS get
 * consumed per trigger?
 *   consumes 100ml, pack 4L → 100ml ÷ 4000ml = 0.025 units
 *   consumes 1 pcs, pack 1 pcs → 1 unit
 *
 * Returns null if the UoMs are incompatible (caller should fall back to
 * legacy raw-qty math + warn the operator).
 */
export function unitsConsumedPerTrigger(args: {
  consumesValue: number;
  consumesUom: string;
  packVolumeValue: number;
  packVolumeUom: string;
}): number | null {
  const consumesInPackUom = convertVolume(
    args.consumesValue,
    args.consumesUom,
    args.packVolumeUom,
  );
  if (consumesInPackUom == null) return null;
  if (args.packVolumeValue <= 0) return null;
  return consumesInPackUom / args.packVolumeValue;
}

/**
 * Boolean: does the SKU's stored pack_volume meaningfully differ from
 * what was parsed off the Amazon page? Used by the items-page banner
 * to flag operators when a sourced product has different packaging
 * than what the catalog assumed.
 *
 * "Different" = different value (within 1% tolerance to ignore rounding)
 * OR different measure_kind (e.g. SKU was 1 L, Amazon is 4 kg).
 */
export function packVolumeMismatch(args: {
  skuValue: number | null;
  skuUom: string | null;
  amazonValue: number | null;
  amazonUom: string | null;
}): boolean {
  if (args.amazonValue == null || !args.amazonUom) return false;
  if (args.skuValue == null || !args.skuUom) return true; // SKU has none, Amazon has → mismatch
  // Different measure kind → always mismatch
  if (!areUomsCompatible(args.skuUom, args.amazonUom)) return true;
  // Same kind — convert and compare
  const skuInAmazonUom = convertVolume(args.skuValue, args.skuUom, args.amazonUom);
  if (skuInAmazonUom == null) return true;
  const ratio = args.amazonValue / skuInAmazonUom;
  return ratio < 0.99 || ratio > 1.01;
}
