import Image from 'next/image';
import { Palette } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

const SWATCHES = [
  { name: 'Navy', hex: '#1E2D4A', tw: 'slate-800' },
  { name: 'Blue (wordmark)', hex: '#5F7397', tw: 'slate-500' },
  { name: 'Cream', hex: '#F5F1E8', tw: 'custom var --bh-cream' },
  { name: 'Gold', hex: '#D4A93A', tw: 'yellow-600' },
];

export default async function BeithadyBrandingPage() {
  await requireBeithadyPermission('settings', 'read');

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Settings', href: '/emails/beithady/settings' },
      { label: 'Branding' },
    ]}>
      <BeithadyHeader
        eyebrow="Beit Hady · Settings · Branding"
        title="Branding"
        subtitle="Logo, palette, and font choices applied across all Beit Hady pages."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="ix-card p-6 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Palette size={16} className="text-yellow-600" />
            Current logos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative h-32 bg-stone-50 dark:bg-stone-900 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
              <Image src="/brand/beithady/wordmark.jpg" alt="Beit Hady wordmark" fill className="object-contain p-3" sizes="200px" />
            </div>
            <div className="relative h-32 bg-stone-50 dark:bg-stone-900 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
              <Image src="/brand/beithady/monogram.jpg" alt="Beit Hady monogram" fill className="object-contain p-3" sizes="200px" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Logos sourced from <code>BeitHady Logos/</code>. Replace the files at
            <code className="mx-1">public/brand/beithady/{`{wordmark,monogram}.jpg`}</code> to swap.
          </p>
        </div>

        <div className="ix-card p-6 space-y-3">
          <h2 className="font-semibold">Palette</h2>
          <div className="space-y-2">
            {SWATCHES.map(s => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700" style={{ backgroundColor: s.hex }} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500"><code>{s.hex}</code> · Tailwind: <code>{s.tw}</code></div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 pt-2">
            Palette eyeballed from logo + branded-item screenshots
            (Plan v0.3 Q-D). The brand-identity PDFs exceed the read tool's
            100MB limit; if you supply hex codes from the source PDF, we'll
            tighten the values in a follow-up.
          </p>
        </div>

        <div className="ix-card p-6 space-y-2 lg:col-span-2">
          <h2 className="font-semibold">Typography</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Body: <code>Inter</code> (existing). Display: serif fallback chain
            <code className="mx-1">Cormorant Garamond → Playfair Display → ui-serif</code>
            applied to <code>BeithadyHeader</code> titles. Confirm font choice in a
            later turn and we'll wire <code>next/font/google</code> for the chosen face.
          </p>
        </div>
      </div>
    </BeithadyShell>
  );
}
