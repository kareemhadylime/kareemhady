import Link from 'next/link';
import { ShoppingBag, Boxes } from 'lucide-react';

// Simple two-tab switcher between the finished-products catalogue and the
// raw-materials catalogue. Server-rendered; same chevron-rotation pattern as
// the other admin tabs but scoped to the Kika inventory routes.

export type InventoryTabId = 'products' | 'raw';

const TABS: Array<{
  id: InventoryTabId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: 'products',
    label: 'Finished products',
    href: '/emails/kika/inventory',
    Icon: ShoppingBag,
  },
  {
    id: 'raw',
    label: 'Raw materials',
    href: '/emails/kika/inventory/raw-materials',
    Icon: Boxes,
  },
];

export function InventoryTabs({ active }: { active: InventoryTabId }) {
  return (
    <nav
      aria-label="Inventory sections"
      className="flex items-center gap-1 border-b border-slate-200 -mb-px"
    >
      {TABS.map(t => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
              isActive
                ? 'border-sky-600 text-sky-700 bg-sky-50/40'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <t.Icon
              size={14}
              className={isActive ? 'text-sky-600' : 'text-slate-400'}
            />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
