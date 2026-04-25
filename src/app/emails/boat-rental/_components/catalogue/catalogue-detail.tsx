import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Users, Ship, Check, DollarSign } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { signedImageUrls } from '@/lib/boat-rental/storage';
import { partitionFeatures } from '@/lib/boat-rental/features';
import { TabNav, type TabItem } from '../tabs';
import { CataloguePhotoGallery } from './photo-gallery';
import { PdfLink } from './pdf-link';
import type { CatalogueScope } from './catalogue-grid';

// Catalogue Detail — full boat detail with hero photo + thumbnail
// gallery + features + a "Download PDF" link. Same component for all
// three portals; access scoped via the `scope` arg.

type Boat = {
  id: string;
  name: string;
  size: string | null;
  hull: 'wood' | 'fiberglass' | null;
  description: string | null;
  features_md: string | null;
  features: string[] | null;
  capacity_guests: number;
  status: 'active' | 'maintenance' | 'inactive';
  owner_id: string;
};

type Props = {
  boatId: string;
  scope: CatalogueScope;
  basePath: string;
  tabs: TabItem[];
  currentPath: string;
};

const STATUS_PILL: Record<Boat['status'], { label: string; cls: string }> = {
  active:      { label: 'Active',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  maintenance: { label: 'Maintenance',  cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  inactive:    { label: 'Inactive',     cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

export async function CatalogueDetail({ boatId, scope, basePath, tabs, currentPath }: Props) {
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, name, size, hull, description, features_md, features, capacity_guests, status, owner_id')
    .eq('id', boatId)
    .maybeSingle();
  const boat = boatRow as Boat | null;
  if (!boat) notFound();
  const { always, onDemand } = partitionFeatures(boat.features || []);

  // Scope guard — never trust the route param.
  if (scope.kind === 'active-only' && boat.status !== 'active') notFound();
  if (scope.kind === 'own-only' && !scope.ownerIds.includes(boat.owner_id)) notFound();

  const { data: imgRaw } = await sb
    .from('boat_rental_boat_images')
    .select('id, storage_path, sort_order')
    .eq('boat_id', boatId)
    .order('sort_order');
  const images = ((imgRaw as unknown) as Array<{ id: string; storage_path: string; sort_order: number }> | null) || [];
  const urls = await signedImageUrls(images.map(i => i.storage_path));
  const photos = urls
    .map((u, i) => (u ? { url: u, alt: `${boat.name} photo ${i + 1}` } : null))
    .filter(Boolean) as { url: string; alt: string }[];

  const pill = STATUS_PILL[boat.status];
  const hullLabel = boat.hull === 'wood' ? 'Wood Hull' : boat.hull === 'fiberglass' ? 'Fiber Glass Hull' : null;

  return (
    <>
      {tabs.length > 0 && <TabNav tabs={tabs} currentPath={currentPath} />}

      <header className="mb-4 flex items-center gap-2">
        <Link
          href={basePath}
          className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 inline-flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Back to Catalogue
        </Link>
      </header>

      <section className="ix-card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{boat.name}</h1>
              <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${pill.cls}`}>
                {pill.label}
              </span>
              {hullLabel && (
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                  {hullLabel}
                </span>
              )}
            </div>
            {boat.description && (
              <p className="text-base text-slate-700 dark:text-slate-200 mt-2 italic leading-relaxed">
                {boat.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300 mt-3">
              {boat.size && (
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {boat.size} ft
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users size={14} /> {boat.capacity_guests} guests
              </span>
            </div>
          </div>
          <PdfLink boatId={boat.id} />
        </div>

        {photos.length > 0 ? (
          <CataloguePhotoGallery photos={photos} />
        ) : (
          <div className="aspect-[16/9] rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 gap-2">
            <Ship size={32} />
            <span className="text-sm">No photos uploaded</span>
          </div>
        )}

        {(always.length > 0 || onDemand.length > 0) && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {always.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 uppercase tracking-wide mb-3">
                  Always Included
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-3">
                  {always.map(f => (
                    <li key={f.code} className="text-sm text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
                      <Check size={14} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {onDemand.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-3 inline-flex items-center gap-1">
                  <DollarSign size={13} /> On Demand · Available on request
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-3">
                  {onDemand.map(f => (
                    <li key={f.code} className="text-sm text-slate-700 dark:text-slate-200 inline-flex items-center gap-2">
                      <DollarSign size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {boat.features_md && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Other features
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
              {boat.features_md}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
