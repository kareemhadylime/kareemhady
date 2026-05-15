'use client';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';

export function AddReelForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setPending(true);
        try {
          await action(fd);
          formRef.current?.reset();
        } finally {
          setPending(false);
        }
      }}
      className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_80px_auto] gap-2 items-start"
    >
      <input
        type="url"
        name="url"
        required
        placeholder="https://www.tiktok.com/@beithady/video/72..."
        className="ix-input"
        autoComplete="off"
      />
      <input
        type="text"
        name="caption"
        placeholder="Caption (optional)"
        className="ix-input"
        autoComplete="off"
      />
      <input
        type="text"
        name="building_code"
        placeholder="Building (opt.)"
        className="ix-input"
        autoComplete="off"
      />
      <input
        type="number"
        name="sort_order"
        defaultValue="0"
        title="Lower = earlier"
        className="ix-input text-center"
      />
      <button type="submit" disabled={pending} className="ix-btn-primary whitespace-nowrap">
        <Plus size={14} /> {pending ? 'Adding…' : 'Add reel'}
      </button>
    </form>
  );
}
