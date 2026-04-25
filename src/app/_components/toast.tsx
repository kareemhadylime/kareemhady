'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string; duration: number };

type ToastContextShape = {
  toast: (message: string, opts?: { kind?: ToastKind; duration?: number }) => void;
};

const ToastContext = createContext<ToastContextShape | null>(null);

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, opts: { kind?: ToastKind; duration?: number } = {}) => {
    const id = ++idCounter;
    const t: Toast = { id, kind: opts.kind || 'info', message, duration: opts.duration ?? 3500 };
    setToasts(prev => [...prev, t]);
  }, []);

  function dismiss(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed z-50 pointer-events-none flex flex-col gap-2
                   inset-x-0 top-4 items-center
                   sm:inset-auto sm:top-auto sm:bottom-4 sm:right-4 sm:items-end"
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(handle);
  }, [toast.duration, onDismiss]);

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertTriangle : Info;
  const tint =
    toast.kind === 'success'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800'
      : toast.kind === 'error'
        ? 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800'
        : 'bg-white text-slate-900 border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700';

  return (
    <div
      role="status"
      className={`pointer-events-auto max-w-sm w-[calc(100%-2rem)] sm:w-auto px-4 py-3 rounded-lg border shadow-lg flex items-center gap-3 ${tint}`}
    >
      <Icon size={16} className="shrink-0" />
      <span className="text-sm flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 opacity-60 hover:opacity-100 transition"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextShape {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} }; // defensive no-op
  return ctx;
}
