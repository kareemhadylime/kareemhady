export const BH_BUILDINGS = [
  { code: 'BH-26',  name: 'Beit Hady 26' },
  { code: 'BH-73',  name: 'Beit Hady 73' },
  { code: 'BH-435', name: 'Beit Hady 435' },
  { code: 'BH-OK',  name: 'Beit Hady OK' },
  { code: 'BH-34',  name: 'Beit Hady 34' },
] as const;

export type BhBuildingCode = (typeof BH_BUILDINGS)[number]['code'];

export const UNATTRIBUTED = 'Unattributed';

export function isBhBuilding(code: string): code is BhBuildingCode {
  return BH_BUILDINGS.some(b => b.code === code);
}
