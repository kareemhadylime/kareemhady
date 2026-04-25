import { notFound, redirect } from 'next/navigation';
import { Users, Phone, Check, DollarSign } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getBoatRoles, getOwnedOwnerIds, type BoatRole } from '@/lib/boat-rental/auth';
import { signedImageUrls, signedImageUrl } from '@/lib/boat-rental/storage';
import { partitionFeatures } from '@/lib/boat-rental/features';
import { PrintTrigger } from './print-trigger';

// One-page A4 spec sheet for a single boat. Linked from the Catalogue
// detail page via PdfLink (opens in new tab, auto-fires window.print()
// via PrintTrigger). User saves as PDF from the browser dialog.
//
// Branding rules (per W1-W4 decisions):
//   - Header logo  = viewer's app_users.logo_path (broker only — owners
//                    and admins won't have one set; falls back to a
//                    big boat name with no logo).
//   - Footer phone = viewer's app_users.whatsapp.
//   - No Lime branding, no pricing, no skipper, no owner name.
//   - First 5 photos by sort_order.

export const dynamic = 'force-dynamic';

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

type ViewerInfo = {
  username: string;
  whatsapp: string | null;
  logoUrl: string | null;
};

async function loadViewer(): Promise<{ id: string; roles: BoatRole[]; info: ViewerInfo } | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('app_users')
    .select('id, username, whatsapp, logo_path')
    .eq('id', me.id)
    .maybeSingle();
  const u = data as { id: string; username: string; whatsapp: string | null; logo_path: string | null } | null;
  if (!u) return null;
  const logoUrl = await signedImageUrl(u.logo_path);
  const roleRows = await getBoatRoles(me);
  const roles = roleRows.map(r => r.role);
  return {
    id: u.id,
    roles,
    info: { username: u.username, whatsapp: u.whatsapp, logoUrl },
  };
}

export default async function BoatPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const viewer = await loadViewer();
  if (!viewer) redirect('/login?next=' + encodeURIComponent(`/emails/boat-rental/print/${id}`));

  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, name, size, hull, description, features_md, features, capacity_guests, status, owner_id')
    .eq('id', id)
    .maybeSingle();
  const boat = boatRow as Boat | null;
  if (!boat) notFound();
  const { always, onDemand } = partitionFeatures(boat.features || []);

  // Scope check — match the catalogue rules for whichever role is
  // viewing. Admins see all; brokers only active; owners only own.
  const isAdmin = viewer.roles.includes('admin');
  const isBroker = viewer.roles.includes('broker');
  const isOwner = viewer.roles.includes('owner');

  if (!isAdmin) {
    if (isBroker && boat.status !== 'active') notFound();
    if (isOwner && !isBroker) {
      const me = await getCurrentUser();
      const ownerIds = me ? await getOwnedOwnerIds(me) : [];
      if (!ownerIds.includes(boat.owner_id)) notFound();
    }
    if (!isBroker && !isOwner) notFound();
  }

  // First 5 photos (hero + up to 4 thumbs).
  const { data: imgRaw } = await sb
    .from('boat_rental_boat_images')
    .select('storage_path, sort_order')
    .eq('boat_id', id)
    .order('sort_order')
    .limit(5);
  const imgRows = ((imgRaw as unknown) as Array<{ storage_path: string }> | null) || [];
  const urls = await signedImageUrls(imgRows.map(r => r.storage_path));
  const photos = urls.filter(Boolean) as string[];
  const hero = photos[0] || null;
  const thumbs = photos.slice(1, 5);

  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const hullLabel = boat.hull === 'wood' ? 'Wood Hull' : boat.hull === 'fiberglass' ? 'Fiber Glass Hull' : null;

  return (
    <>
      <PrintTrigger />
      {/* On-screen wrapper centers the A4 page on grey backdrop; print
          rules in globals.css strip backdrop and force exact A4. */}
      <div className="min-h-screen bg-slate-200 dark:bg-slate-900 py-6 print:bg-white print:py-0">
        <main
          className="
            mx-auto bg-white text-slate-900 shadow-xl rounded
            print:shadow-none print:rounded-none print:mx-0 print:max-w-none
            flex flex-col
          "
          style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '12mm 14mm',
            boxSizing: 'border-box',
          }}
        >
          {/* Header — logo + boat name + date. Description sits on
              its own marketing-tagline line below. */}
          <header className="flex items-start justify-between gap-4 pb-3 border-b-2 border-cyan-500">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              {viewer.info.logoUrl ? (
                <div className="w-[140px] h-[64px] flex items-center justify-start shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewer.info.logoUrl}
                    alt={`${viewer.info.username} logo`}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <div className={`font-bold tracking-tight leading-none ${viewer.info.logoUrl ? 'text-3xl' : 'text-5xl'}`}>
                  {boat.name}
                </div>
                <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wide font-semibold">
                  Boat spec sheet
                </div>
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-500 uppercase tracking-wide font-semibold shrink-0">
              {todayStr}
            </div>
          </header>

          {/* Description tagline — full-width italic marketing copy */}
          {boat.description && (
            <p className="mt-3 text-base italic text-slate-700 leading-relaxed">
              {boat.description}
            </p>
          )}

          {/* Size — own line, BIG, marketing focal */}
          {boat.size && (
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-4xl font-bold text-cyan-700 tabular-nums leading-none">
                {boat.size}
              </span>
              <span className="text-lg font-semibold text-slate-700">ft</span>
              {hullLabel && (
                <span className="ml-3 text-[11px] uppercase tracking-wide font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  {hullLabel}
                </span>
              )}
            </div>
          )}

          {/* Quick facts strip — capacity + status */}
          <section className="mt-3 flex items-center gap-6 text-sm">
            <div className="inline-flex items-center gap-1.5">
              <Users size={18} className="text-cyan-600" />
              <span className="font-bold text-slate-900 text-base">{boat.capacity_guests}</span>
              <span className="text-slate-600">guests</span>
            </div>
            <div
              className={
                'font-semibold inline-block px-2 py-0.5 rounded text-xs ' +
                (boat.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : boat.status === 'maintenance'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200')
              }
            >
              {boat.status.charAt(0).toUpperCase() + boat.status.slice(1)}
            </div>
          </section>

          {/* Photos: hero (left, 2-col span) + 4 thumbnails (right, 2x2) */}
          <section className="mt-5 grid grid-cols-3 gap-3">
            <div
              className="col-span-2 bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center"
              style={{ aspectRatio: '4 / 3' }}
            >
              {hero ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero} alt={`${boat.name} hero`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-slate-400">No photos</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 content-start">
              {[0, 1, 2, 3].map(i => {
                const url = thumbs[i];
                return (
                  <div
                    key={i}
                    className="bg-slate-100 rounded-lg overflow-hidden flex items-center justify-center"
                    style={{ aspectRatio: '1 / 1' }}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`${boat.name} ${i + 2}`} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Always Included — marketing-grade pill grid, full-width
              cyan-tinted card so the "what's included" answer pops. */}
          {always.length > 0 && (
            <section className="mt-6 rounded-lg border-2 border-cyan-200 bg-cyan-50/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-cyan-700 font-bold mb-3 inline-flex items-center gap-1.5">
                <Check size={14} className="text-cyan-700" /> Always Included
              </h2>
              <ul className="grid grid-cols-3 gap-y-2 gap-x-3">
                {always.map(f => (
                  <li
                    key={f.code}
                    className="text-[13px] font-semibold text-slate-900 inline-flex items-start gap-1.5 leading-tight"
                  >
                    <Check size={14} className="text-cyan-600 shrink-0 mt-px" strokeWidth={2.5} />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* On Demand — amber, smaller as it's secondary */}
          {onDemand.length > 0 && (
            <section className="mt-3 rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-amber-700 font-bold mb-3 inline-flex items-center gap-1.5">
                <DollarSign size={14} className="text-amber-700" /> On Demand · Available on request
              </h2>
              <ul className="grid grid-cols-3 gap-y-2 gap-x-3">
                {onDemand.map(f => (
                  <li
                    key={f.code}
                    className="text-[13px] font-semibold text-slate-900 inline-flex items-start gap-1.5 leading-tight"
                  >
                    <DollarSign size={14} className="text-amber-600 shrink-0 mt-px" strokeWidth={2.5} />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Other (free-text) features */}
          {boat.features_md && (
            <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-600 font-bold mb-2">
                Additional features
              </h2>
              <p className="text-[12px] text-slate-800 whitespace-pre-line leading-relaxed">
                {boat.features_md}
              </p>
            </section>
          )}

          <div className="flex-1" />

          {/* Footer */}
          <footer className="pt-4 mt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Prepared by <span className="font-semibold text-slate-900">{viewer.info.username}</span>
            </div>
            {viewer.info.whatsapp && (
              <div className="inline-flex items-center gap-1.5">
                <Phone size={11} className="text-emerald-600" />
                <span className="font-semibold text-slate-900">+{viewer.info.whatsapp}</span>
              </div>
            )}
          </footer>
        </main>
      </div>
    </>
  );
}
