'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// Legacy storage key — kept as-is to preserve existing operator pin preferences.
// Despite the "perf-dashboard" name, this hook now serves any BH dashboard.
const STORAGE_KEY = 'bh:perf-dashboard:rail-pinned:v1';
const IDLE_MS = 3000;

export function useRailCollapse() {
  // SSR-safe: hydrate to defaults, sync from localStorage on mount.
  const [collapsed, setCollapsed] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === 'true') setPinned(true);
    } catch { /* swallow */ }
  }, []);

  const writePinned = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* swallow */ }
  }, []);

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      writePinned(next);
      if (next && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (next) setCollapsed(false);
      return next;
    });
  }, [writePinned]);

  const handleEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCollapsed(false);
  }, []);

  const handleLeave = useCallback(() => {
    if (pinned) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCollapsed(true);
      timerRef.current = null;
    }, IDLE_MS);
  }, [pinned]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { collapsed, pinned, togglePinned, handleEnter, handleLeave };
}
