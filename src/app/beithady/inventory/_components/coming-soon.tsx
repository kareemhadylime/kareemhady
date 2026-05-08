import Link from 'next/link';
import { ChevronLeft, Construction } from 'lucide-react';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export function InventoryComingSoon({
  title, subtitle, phase, description,
}: {
  title: string;
  subtitle: string;
  phase: string;
  description: string;
}) {
  return (
    <BeithadyShell breadcrumbs={[{ label: 'Inventory', href: '/beithady/inventory' }, { label: title }]} containerClass="max-w-5xl">
      <BeithadyHeader
        eyebrow={`Beit Hady · Inventory · ${phase}`}
        title={title}
        subtitle={subtitle}
      />
      <div className="ix-card p-10 text-center max-w-xl mx-auto">
        <Construction size={28} className="mx-auto text-amber-600" />
        <h2 className="mt-3 text-lg font-semibold" style={{ color: 'var(--bh-navy)' }}>
          Coming in {phase}
        </h2>
        <p className="text-sm text-slate-500 mt-2 leading-snug">{description}</p>
        <Link
          href="/beithady/inventory"
          className="mt-4 inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 font-medium"
        >
          <ChevronLeft size={12} /> Back to Inventory
        </Link>
      </div>
    </BeithadyShell>
  );
}
