// src/app/fmplus/performance/_components/panel-state.ts
'use client';
import { useEffect, useState, useCallback } from 'react';

const VISIBILITY_KEY = 'fmplus_perf_panels';
const COLLAPSE_KEY = 'fmplus_perf_panels_collapsed';

function readJson(key: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
function writeJson(key: string, v: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(v));
}

export function usePanelState(id: string) {
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function reread() {
      const v = readJson(VISIBILITY_KEY);
      const c = readJson(COLLAPSE_KEY);
      setVisible(v[id] !== false);
      setCollapsed(c[id] === true);
    }
    reread();
    window.addEventListener('fmplus_perf_panels_changed', reread);
    return () => window.removeEventListener('fmplus_perf_panels_changed', reread);
  }, [id]);

  const hide = useCallback(() => {
    setVisible(false);
    const v = readJson(VISIBILITY_KEY); v[id] = false; writeJson(VISIBILITY_KEY, v);
  }, [id]);

  const show = useCallback(() => {
    setVisible(true);
    const v = readJson(VISIBILITY_KEY); v[id] = true; writeJson(VISIBILITY_KEY, v);
  }, [id]);

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      const c = readJson(COLLAPSE_KEY); c[id] = next; writeJson(COLLAPSE_KEY, c);
      return next;
    });
  }, [id]);

  return { visible, collapsed, hide, show, toggleCollapse };
}
