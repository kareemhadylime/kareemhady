import Link from 'next/link';
import Image from 'next/image';
import { Plus, Ship, ArrowRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { TabNav, ADMIN_TABS } from '../../_components/tabs';
import { createBoatAction } from './actions';

export const dynamic = 'force-dynamic';

type Boat = {
  id: string;
  name: string;
  size: string | null;
  capacity_guests: number;
  status: string;
  owner: { name: string } | null;
  skipper_name: string;
};
type ImgCount = { boat_id: string; count: number };

export default async function BoatsAdmin() {
  const sb = supabaseAdmin();

  const [boatsRes, ownersRes, imagesRes] = await Promise.all([
    sb
      .from('boat_rental_boats')
      .select('id, name, size, capacity_guests, status, skipper_name, owner:boat_rental_owners(name)')
      .order('created_at', { ascending: false }),
    sb
      .from('boat_rental_owners')
      .select('id, name')
      .eq('status', 'active')
      .order('name'),
    sb.from('boat_rental_boat_images').select('boat_id, storage_path'),
  ]);

  const boats = ((boatsRes.data as unknown) as Boat[] | null) || [];
  const owners = ((ownersRes.data as unknown) as Array<{ id: string; name: string }> | null) || [];
  const imgRows = ((imagesRes.data as unknown) as Array<{ boat_id: string; storage_path: string }> | null) || [];

  // Pick first image per boat for preview; sign URLs in parallel.
  const firstByBoat = new Map<string, string>();
  for (const r of imgRows) if (!firstByBoat.has(r.boat_id)) firstByBoat.set(r.boat_id, r.storage_path);
  const previews = new Map<string, string | null>();
  await Promise.all(
    [...firstByBoat.entries()].map(async ([bid, path]) => {
      previews.set(bid, await signedImageUrl(path));
    })
  );
  const countByBoat = new Map<string, number>();
  for (const r of imgRows) countByBoat.set(r.boat_id, (countByBoat.get(r.boat_id) || 0) + 1);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Boats</h1>
        <p className="text-sm text-slate-500 mt-1">
          Boat inventory with owner, skipper, capacity, and photo gallery.
        </p>
      </header>
      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin/boats" />

      {owners.length === 0 && (
        <div className="mt-8 ix-card p-6 bg-amber-50 border-amber-200 text-sm text-amber-900">
          Add at least one active owner first on the <Link href="/emails/boat-rental/admin/owners" className="underline">Owners</Link> tab.
        </div>
      )}

      {owners.length > 0 && (
        <section className="mt-8 ix-card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus size={16} /> Add boat</h2>
          <form action={createBoatAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Name *</span>
              <input name="name" required className="ix-input mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Size</span>
              <input name="size" placeholder="e.g. 35ft" className="ix-input mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Owner *</span>
              <select name="owner_id" required className="ix-input mt-1">
                <option value="">Select owner…</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Guest capacity *</span>
              <input name="capacity_guests" type="number" inputMode="numeric" min="1" max="50" required className="ix-input mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Skipper name *</span>
              <input name="skipper_name" required className="ix-input mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Skipper WhatsApp * (digits only)</span>
              <input name="skipper_whatsapp" type="tel" inputMode="tel" required placeholder="201234567890" className="ix-input mt-1" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-slate-600 text-xs">Features</span>
              <textarea name="features_md" rows={3} placeholder="Sun deck · shower · sound system · snorkel gear" className="ix-input mt-1" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-slate-600 text-xs">Images (optional — up to 10, 5MB each, JPG/PNG/WEBP)</span>
              <input name="images" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple className="ix-input mt-1 cursor-pointer" />
            </label>
            <div className="md:col-span-2">
              <button type="submit" className="ix-btn-primary"><Plus size={14} /> Create boat</button>
            </div>
          </form>
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boats.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center md:col-span-3">No boats yet.</div>
        )}
        {boats.map(b => {
          const preview = previews.get(b.id) || null;
          const imgCount = countByBoat.get(b.id) || 0;
          return (
            <Link
              key={b.id}
              href={`/emails/boat-rental/admin/boats/${b.id}`}
              className="group ix-card overflow-hidden hover:shadow-md transition"
            >
              <div className="aspect-[16/10] bg-slate-100 relative">
                {preview ? (
                  <Image src={preview} alt={b.name} fill unoptimized className="object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                    <Ship size={32} />
                  </div>
                )}
                {imgCount > 0 && (
                  <span className="absolute bottom-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/90 text-slate-700">
                    {imgCount} photo{imgCount === 1 ? '' : 's'}
                  </span>
                )}
                {b.status !== 'active' && (
                  <span className="absolute top-2 left-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600">
                    {b.status}
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold truncate">{b.name}</h3>
                  <ArrowRight size={16} className="text-slate-400 group-hover:text-cyan-600 transition" />
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {b.owner?.name || '—'} · capacity {b.capacity_guests}
                  {b.size ? ` · ${b.size}` : ''}
                </p>
                <p className="text-xs text-slate-400 mt-1">Skipper · {b.skipper_name}</p>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
