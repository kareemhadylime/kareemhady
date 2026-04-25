'use client';

import { useTransition } from 'react';
import { setBoatImageCategoryAction } from '../actions';
import {
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABEL,
  type PhotoCategory,
} from '@/lib/boat-rental/photo-categories';

// Auto-submitting category override per photo. The native <select>
// fires onChange; we hand the new value straight to the server action
// in a transition so the row updates without a full refresh.

type Props = {
  imageId: string;
  boatId: string;
  current: PhotoCategory | null;
};

export function CategorySelect({ imageId, boatId, current }: Props) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={current ?? ''}
      disabled={pending}
      onChange={e => {
        const fd = new FormData();
        fd.set('id', imageId);
        fd.set('boat_id', boatId);
        fd.set('category', e.currentTarget.value);
        start(() => setBoatImageCategoryAction(fd));
      }}
      className={
        'w-full text-[10px] px-1.5 py-1 rounded border ' +
        (current
          ? 'bg-cyan-50 border-cyan-300 text-cyan-800 dark:bg-cyan-950 dark:border-cyan-700 dark:text-cyan-200 font-semibold'
          : 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-200 italic')
      }
    >
      <option value="">— Untagged —</option>
      {PHOTO_CATEGORIES.map(c => (
        <option key={c} value={c}>{PHOTO_CATEGORY_LABEL[c]}</option>
      ))}
    </select>
  );
}
