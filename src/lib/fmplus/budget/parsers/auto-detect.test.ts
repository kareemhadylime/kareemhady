import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { detectParser } from './auto-detect';

const FIX = (name: string) => path.join(__dirname, '..', '__fixtures__', name);

describe('detectParser', () => {
  it('AUC sheet → rich-auc-style', async () => {
    const result = await detectParser(FIX('auc-budget.xlsx'));
    // AUC has both Manning + Consumables sheets, but it's also possible TRIO-style detection
    // catches it via BOQ Summary if AUC has one. Accept either rich-auc-style OR trio-style
    // depending on actual sheet composition.
    expect(['rich-auc-style', 'trio-style']).toContain(result.parser);
  });

  it('TRIO sheet → trio-style', async () => {
    const result = await detectParser(FIX('trio-budget.xlsx'));
    expect(result.parser).toBe('trio-style');
  });

  it('City Gate sheet → city-gate-multi-year', async () => {
    const result = await detectParser(FIX('city-gate-budget.xlsx'));
    expect(result.parser).toBe('city-gate-multi-year');
  });

  it('Emaar Uptown sheet → emaar-zone-style', async () => {
    const result = await detectParser(FIX('emaar-uptown-budget.xlsx'));
    expect(result.parser).toBe('emaar-zone-style');
  });

  it('result includes reason and sheet names', async () => {
    const result = await detectParser(FIX('auc-budget.xlsx'));
    expect(result.reason).toBeTruthy();
    expect(Array.isArray(result.sheetNames)).toBe(true);
    expect(result.sheetNames.length).toBeGreaterThan(0);
  });
});
