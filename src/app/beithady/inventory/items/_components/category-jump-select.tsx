'use client';

import type { Category } from '@/lib/beithady/inventory/catalog';

// Replaces the legacy `<select name="category">` filter — instead of round-
// tripping the page, it scrolls to the matching category section anchor.
// Sections render every category, so a "filter" gesture is really just
// "jump to this category".

export function CategoryJumpSelect({
  categories,
  defaultCode,
}: {
  categories: Category[];
  defaultCode?: string;
}) {
  return (
    <select
      defaultValue={defaultCode || ''}
      onChange={e => {
        const code = e.target.value;
        if (!code) return;
        const el = document.getElementById(`cat-${code}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Reset so picking the same category twice still jumps.
        e.currentTarget.value = '';
      }}
      className="ix-input"
      aria-label="Jump to category"
    >
      <option value="">Jump to category…</option>
      {categories.map(c => (
        <option key={c.id} value={c.code}>
          {c.name_en}
        </option>
      ))}
    </select>
  );
}
