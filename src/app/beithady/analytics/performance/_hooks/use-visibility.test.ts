import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _readFromStorage, _writeToStorage } from './use-visibility';
import { defaultVisibility } from '../_lib/panel-registry';

const STORAGE_KEY = 'bh:perf-dashboard:visibility:v1';

// Minimal localStorage shim for the node test environment
function makeLocalStorageShim() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

describe('useVisibility storage helpers', () => {
  let shim: ReturnType<typeof makeLocalStorageShim>;

  beforeEach(() => {
    shim = makeLocalStorageShim();
    // Attach window + localStorage to globalThis so the helpers see it
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: shim },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Remove window so other tests (running in node env) are unaffected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window;
  });

  it('returns defaults when localStorage is empty', () => {
    const result = _readFromStorage();
    expect(result).toEqual(defaultVisibility());
  });

  it('reads back what was written', () => {
    const def = defaultVisibility();
    def['hero-revpar'] = false;
    _writeToStorage(def);
    const result = _readFromStorage();
    expect(result['hero-revpar']).toBe(false);
  });

  it('persists toggle to localStorage at correct key', () => {
    const def = defaultVisibility();
    def['hero-revpar'] = false;
    _writeToStorage(def);
    const stored = JSON.parse(shim.getItem(STORAGE_KEY)!);
    expect(stored['hero-revpar']).toBe(false);
  });

  it('strips unknown keys from stored state', () => {
    shim.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'unknown-panel': false, 'hero-revpar': false }),
    );
    const result = _readFromStorage();
    expect(result['hero-revpar']).toBe(false);
    expect((result as Record<string, unknown>)['unknown-panel']).toBeUndefined();
  });

  it('falls back to defaults on corrupt JSON', () => {
    shim.setItem(STORAGE_KEY, 'not-json{{{');
    const result = _readFromStorage();
    expect(result).toEqual(defaultVisibility());
  });

  it('defaults panels missing from stored state to their default value', () => {
    // Store only partial data (missing most panels)
    shim.setItem(STORAGE_KEY, JSON.stringify({ 'hero-revpar': false }));
    const result = _readFromStorage();
    // hero-revpar should be false (from stored)
    expect(result['hero-revpar']).toBe(false);
    // hero-occupancy should be true (from defaultVisibility)
    expect(result['hero-occupancy']).toBe(true);
    // revenue-waterfall default is false
    expect(result['revenue-waterfall']).toBe(false);
  });

  it('hidden count: two extra panels off = 4 hidden total (includes 2 off-by-default)', () => {
    const def = defaultVisibility();
    def['hero-revpar'] = false;
    def['hero-pace'] = false;
    _writeToStorage(def);
    const result = _readFromStorage();
    // revenue-waterfall and stly-yoy are also false by default = 4 hidden total
    const hidden = Object.values(result).filter((v) => !v).length;
    expect(hidden).toBe(4);
  });
});
