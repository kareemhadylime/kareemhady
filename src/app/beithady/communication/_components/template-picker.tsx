'use client';
import { useMemo, useState } from 'react';
import { FileText, Search, AlertCircle, X } from 'lucide-react';
import {
  CATEGORY_LABELS, CATEGORY_ORDER,
  resolveTemplate, templatesForConversation,
  type Template, type TemplateContext, type TemplateCategory,
} from '@/lib/beithady/communication/templates-shared';

// Phase Q.2 — TemplatePicker popover. Click → search/filter list of
// templates → click template → resolves variables from context →
// inserts body into composer textarea via onInsert callback.

export function TemplatePicker({
  templates,
  channel,
  source,
  context,
  onInsert,
}: {
  templates: Template[];
  channel: string;
  source: string | null;
  context: TemplateContext;
  onInsert: (body: string, unresolved: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<TemplateCategory | 'all'>('all');

  const applicable = useMemo(
    () => templatesForConversation(templates, channel, source),
    [templates, channel, source],
  );

  const filtered = useMemo(() => {
    let pool = applicable;
    if (activeCat !== 'all') pool = pool.filter(t => t.category === activeCat);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      pool = pool.filter(t =>
        t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q),
      );
    }
    return pool;
  }, [applicable, activeCat, query]);

  const categoriesPresent = useMemo(() => {
    const set = new Set<TemplateCategory>();
    for (const t of applicable) set.add(t.category);
    return CATEGORY_ORDER.filter(c => set.has(c));
  }, [applicable]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Insert template"
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
      >
        <FileText size={16} />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-40 w-80 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 p-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
              Templates
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-2 space-y-2">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="ix-input w-full text-xs pl-7"
                autoFocus
              />
            </div>
            {categoriesPresent.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <CategoryChip
                  active={activeCat === 'all'}
                  onClick={() => setActiveCat('all')}
                  label="All"
                />
                {categoriesPresent.map(c => (
                  <CategoryChip
                    key={c}
                    active={activeCat === c}
                    onClick={() => setActiveCat(c)}
                    label={CATEGORY_LABELS[c]}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-slate-400 text-center">No templates match.</div>
            ) : (
              filtered.map(t => {
                const { resolved, unresolved } = resolveTemplate(t.body, context);
                const preview = resolved.slice(0, 90);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onInsert(resolved, unresolved);
                      setOpen(false);
                    }}
                    className="w-full text-left p-2.5 hover:bg-stone-50 dark:hover:bg-slate-800/50 transition group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-slate-900 dark:group-hover:text-white truncate flex-1">
                        {t.name}
                      </span>
                      <span className="text-[9px] uppercase text-slate-400 font-semibold">{t.language}</span>
                      {unresolved.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400" title={`Missing: ${unresolved.join(', ')}`}>
                          <AlertCircle size={10} />
                          {unresolved.length}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {preview}{resolved.length > 90 ? '…' : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
        active
          ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );
}
