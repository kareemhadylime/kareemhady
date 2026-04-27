import { Image as ImageIcon, Sparkles } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';

export const dynamic = 'force-dynamic';

export default async function BeithadyGalleryPage() {
  await requireBeithadyPermission('gallery', 'read');

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Gallery' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Gallery"
        title="Gallery"
        subtitle="Pictures · videos · documents — categorized by building and apartment, AI-labeled."
      />

      <div className="ix-card p-10 text-center max-w-2xl mx-auto space-y-3">
        <div className="w-12 h-12 rounded-xl mx-auto inline-flex items-center justify-center bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
          <ImageIcon size={24} strokeWidth={2.2} />
        </div>
        <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          Phase D coming up
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Building → apartment hierarchy. Drag-drop upload of photos and videos,
          AI auto-labeling (room type · features · ad-suitability score), document
          library (floor plans, house rules, owner contracts), and the seeded
          BeitHady brand-asset library (door signs, room cards, branded items).
        </p>
      </div>
    </BeithadyShell>
  );
}
