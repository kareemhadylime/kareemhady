'use client';
import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { CATEGORIES } from '@/lib/personal-email/categories';
import { moveEmail } from '../../actions';
import type { CategorySlug } from '@/lib/personal-email/types';

export function MoveDropdown({
  emailId, current,
}: { emailId: string; current: CategorySlug | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={pending}
        className="ix-btn-secondary"
      >
        Move to <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
          {CATEGORIES.filter(c => c.slug !== current).map(c => (
            <button
              key={c.slug}
              onClick={() => {
                setOpen(false);
                start(() => moveEmail(emailId, c.slug));
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              {c.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
