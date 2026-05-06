'use client';
import { useCallback, useEffect, useState } from 'react';
import { type PanelId, PANEL_IDS, defaultVisibility } from '../_lib/panel-registry';

const STORAGE_KEY = 'bh:perf-dashboard:visibility:v1';

type State = Record<PanelId, boolean>;

export function _readFromStorage(): State {
  if (typeof window === 'undefined') return defaultVisibility();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultVisibility();
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    // Validate: every key must be a known PanelId. Strip unknowns. Fall back
    // to default when any required panel is missing.
    const out = defaultVisibility();
    for (const id of PANEL_IDS) {
      if (typeof parsed[id] === 'boolean') out[id] = parsed[id];
    }
    return out;
  } catch {
    return defaultVisibility();
  }
}

export function _writeToStorage(state: State): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full or disabled — silently drop
  }
}

export function useVisibility() {
  // SSR safe: hydrate to defaults on server, then sync from localStorage on mount
  const [state, setState] = useState<State>(() => defaultVisibility());

  useEffect(() => {
    setState(_readFromStorage());
  }, []);

  const setPanel = useCallback((id: PanelId, visible: boolean) => {
    setState((prev) => {
      const next = { ...prev, [id]: visible };
      _writeToStorage(next);
      return next;
    });
  }, []);

  const setMany = useCallback((updates: Partial<State>) => {
    setState((prev) => {
      const next = { ...prev, ...updates };
      _writeToStorage(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const def = defaultVisibility();
    _writeToStorage(def);
    setState(def);
  }, []);

  const hiddenCount = PANEL_IDS.filter((id) => !state[id]).length;

  return { visibility: state, setPanel, setMany, reset, hiddenCount };
}
