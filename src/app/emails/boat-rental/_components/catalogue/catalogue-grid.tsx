import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Users, Ship, ImageIcon } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { TabNav, type TabItem } from '../tabs';

// Catalogue Grid — read-only, presentational. Used in all three portals
// (broker / owner / admin) with a different scope filter. Renders a
// card grid of boats with first photo + name + capacity + status.

export type CatalogueScope =
  | { kind: 'active-only' }                              // brokers
  | { kind: 'own-only'; ownerIds: string[] }             // owners (their own boat_rental_owners ids)
  | { kind: 'all' };                                     // admins

type Boat = {
  id: string;
  name: string;
  size: string | null;
  capacity_guests: number;
  status: 'active' | 'maintenance' | 'inactive';
  owner_id: string;
};

type Props = {
  scope: CatalogueScope;
  basePath: string;       // e.g. '/emails/boat-rental/broker/inventory'
  tabs: TabItem[];
  currentPath: string;
};

const STATUS_PILL: Record<Boat['status'], { label: string; cls: string }> = {
  active:      { label: 'Active',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  maintenance: { label: 'Maintenance',  cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  inactive:    { label: 'Inactive',     cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

export async function CatalogueGrid({ scope, basePath, tabs, currentPath }: Props) {
  const sb = supabaseAdmin();

  let query = sb
    .from('boat_rental_boats')
    .select('id, name, size, capacity_guests, status, owner_id')
    .order('name');

  if (scope.kind === 'active-only') {
    query = query.eq('status', 'active');
  } else if (scope.kind === 'own-only') {
    if (scope.ownerIds.length === 0) {
      // No owner record linked → nothing to show.
      return (
        <>
          {tabs.length > 0 && <TabNav tabs={tabs} currentPath={currentPath} />}
          <Header />
          <div className="ix-card p-8 text-sm text-slate-500 text-center mt-6">
            No boats linked to your account yet.
          </div>
        </>
      );
    }
    query = query.in('owner_id', scope.ownerIds);
  }

  const { data: boatsRaw } = await query;
  const boats = ((boatsRaw as unknown) as Boat[] | null) || [];

  // First photo per boat for the card preview.
  const { data: imgRaw } = await sb
    .from('boat_rental_boat_images')
    .select('boat_id, storage_path, sort_order')
    .in('boat_id', boats.map(b => b.id))
    .order('sort_order');
  const imgRows = ((imgRaw as unknown) as Array<{ boat_id: string; storage_path: string }> | null) || [];

  const firstByBoat = new Map<string, string>();
  for (const r of imgRows) if (!firstByBoat.has(r.boat_id)) firstByBoat.set(r.boat_id, r.storage_path);
  const previews = new Map<string, string | null>();
  await Promise.all(
    [...firstByBoat.entries()].map(async ([bid, path]) => {
      previews.set(bid, await signedImageUrl(path));
    })
  );
  const photoCount = new Map<string, number>();
  for (const r of imgRows) photoCount.set(r.boat_id, (photoCount.get(r.boat_id) || 0) + 1);

  return (
    <>
      {tabs.length > 0 && <TabNav tabs={tabs} currentPath={currentPath} />}
      <Header />

      {boats.length === 0 ? (
        <div className="ix-card p-8 text-sm text-slate-500 text-center mt-6">
          No boats to show.
        </div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {boats.map(b => {
            const url = previews.get(b.id);
            const count = photoCount.get(b.id) || 0;
            const pill = STATUS_PILL[b.status];
            return (
              <Link
                key={b.id}
                href={`${basePath}/${b.id}`}
                className="group ix-card overflow-hidden hover:shadow-lg hover:border-cyan-300 dark:hover:border-cyan-700 transition flex flex-col"
              >
                <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  {url ? (
                    <Image
                      src={url}
                      alt={b.name}
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <Ship size={32} />
                      <span className="text-xs">No photos</span>
                    </div>
                  )}
                  {count > 0 && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-semibold inline-flex items-center gap-1">
                      <ImageIcon size={10} /> {count}
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-tight">{b.name}</h3>
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border shrink-0 ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                    {b.size && <span>{b.size}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} /> {b.capacity_guests} guests
                    </span>
                  </div>
                  <div className="flex-1" />
                  <div className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold inline-flex items-center gap-1 group-hover:translate-x-0.5 transition">
                    View details <ArrowRight size={12} />
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}

function Header() {
  return (
    <header className="mb-2">
      <h1 className="text-2xl font-bold tracking-tight">Boat Catalogue</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Browse the fleet, view photos, and download a one-page A4 spec sheet to send to your client.
      </p>
    </header>
  );
}
