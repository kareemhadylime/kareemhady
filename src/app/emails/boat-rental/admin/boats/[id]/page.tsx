import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ChevronLeft, Save, Trash2, X, Star, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { signedImageUrls } from '@/lib/boat-rental/storage';
import type { PhotoCategory } from '@/lib/boat-rental/photo-categories';
import {
  updateBoatAction,
  deleteBoatImageAction,
  deleteBoatAction,
  setPrimaryBoatImageAction,
  moveBoatImageAction,
  backfillBoatPhotosClassificationAction,
} from '../actions';
import { BoatImageUploader } from '../_components/image-uploader';
import { FeaturePicker } from '../_components/feature-picker';
import { CategorySelect } from '../_components/category-select';

export const dynamic = 'force-dynamic';

type BoatWithOwner = {
  id: string;
  name: string;
  size: string | null;
  hull: 'wood' | 'fiberglass' | null;
  description: string | null;
  features_md: string | null;
  features: string[] | null;
  capacity_guests: number;
  owner_id: string;
  skipper_name: string;
  skipper_whatsapp: string;
  status: string;
};

export default async function BoatDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: boatRow } = await sb
    .from('boat_rental_boats')
    .select('id, name, size, hull, description, features_md, features, capacity_guests, owner_id, skipper_name, skipper_whatsapp, status')
    .eq('id', id)
    .maybeSingle();
  const boat = boatRow as BoatWithOwner | null;
  if (!boat) notFound();

  const [ownersRes, imagesRes, pricingRes] = await Promise.all([
    sb.from('boat_rental_owners').select('id, name').order('name'),
    sb
      .from('boat_rental_boat_images')
      .select('id, storage_path, sort_order, is_primary, category')
      .eq('boat_id', id)
      .order('sort_order'),
    sb.from('boat_rental_pricing').select('tier, amount_egp').eq('boat_id', id),
  ]);
  const owners = ((ownersRes.data as unknown) as Array<{ id: string; name: string }> | null) || [];
  const images = ((imagesRes.data as unknown) as Array<{ id: string; storage_path: string; sort_order: number; is_primary: boolean; category: PhotoCategory | null }> | null) || [];
  const untaggedCount = images.filter(i => !i.category).length;
  const pricing = ((pricingRes.data as unknown) as Array<{ tier: string; amount_egp: string | number }> | null) || [];

  const imageUrls = await signedImageUrls(images.map(i => i.storage_path));

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link href="/emails/boat-rental/admin/boats" className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Boats
        </Link>
      </header>

      <section className="mt-8 ix-card p-6">
        <h2 className="font-semibold mb-4">Boat details</h2>
        <form action={updateBoatAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="id" value={boat.id} />
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Name *</span>
            <input name="name" required defaultValue={boat.name} className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Size in ft</span>
            <input name="size" defaultValue={boat.size || ''} placeholder="e.g. 35" className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Hull</span>
            <select name="hull" defaultValue={boat.hull || ''} className="ix-input mt-1">
              <option value="">— Select hull —</option>
              <option value="wood">Wood</option>
              <option value="fiberglass">Fiber Glass</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Owner *</span>
            <select name="owner_id" required defaultValue={boat.owner_id} className="ix-input mt-1">
              {owners.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600 dark:text-slate-300 text-xs">
              Boat description (marketing tagline — appears on the catalogue PDF under the boat name)
            </span>
            <textarea
              name="description"
              rows={2}
              defaultValue={boat.description || ''}
              placeholder="e.g. Spacious 35ft cruiser perfect for full-day Red Sea getaways with family and friends."
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Status</span>
            <select name="status" defaultValue={boat.status} className="ix-input mt-1">
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Guest capacity *</span>
            <input name="capacity_guests" type="number" inputMode="numeric" min="1" max="50" required defaultValue={boat.capacity_guests} className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Skipper name *</span>
            <input name="skipper_name" required defaultValue={boat.skipper_name} className="ix-input mt-1" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Skipper WhatsApp *</span>
            <input name="skipper_whatsapp" type="tel" inputMode="tel" required defaultValue={boat.skipper_whatsapp} className="ix-input mt-1" />
          </label>
          <div className="md:col-span-2">
            <span className="text-slate-600 dark:text-slate-300 text-xs block mb-2">
              Features (pick all that apply)
            </span>
            <FeaturePicker defaultSelected={boat.features || []} />
          </div>
          <label className="text-sm md:col-span-2">
            <span className="text-slate-600 dark:text-slate-300 text-xs">
              Other features (free text — anything not in the list above)
            </span>
            <textarea
              name="features_md"
              rows={2}
              defaultValue={boat.features_md || ''}
              placeholder="e.g. Sound system · sun shade · custom bar setup"
              className="ix-input mt-1"
            />
          </label>
          <div className="md:col-span-2 flex items-center justify-between">
            <button type="submit" className="ix-btn-primary"><Save size={14} /> Save changes</button>
          </div>
        </form>
      </section>

      <section className="mt-6 ix-card p-6">
        <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-semibold">Photos ({images.length} / 10)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Star = catalogue + PDF hero. AI auto-tags new uploads — change a tag to override.
            Use ↑/↓ to reorder.
          </p>
        </div>

        {untaggedCount > 0 && (
          <form action={backfillBoatPhotosClassificationAction} className="mb-3">
            <input type="hidden" name="boat_id" value={boat.id} />
            <button
              type="submit"
              className="ix-btn-secondary text-xs border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950"
              title="Run Claude vision on every untagged photo and assign a category. ~1-2 sec per photo."
            >
              <Sparkles size={12} /> Auto-tag {untaggedCount} untagged photo{untaggedCount === 1 ? '' : 's'}
            </button>
          </form>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {images.map((img, i) => (
              <div
                key={img.id}
                className={
                  'relative rounded-lg overflow-hidden flex flex-col ' +
                  (img.is_primary
                    ? 'ring-2 ring-amber-500 shadow-lg shadow-amber-500/20'
                    : 'border border-slate-200 dark:border-slate-700')
                }
              >
                <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                  {imageUrls[i] && (
                    <Image src={imageUrls[i] as string} alt="" fill unoptimized className="object-cover" />
                  )}
                  {img.is_primary && (
                    <span className="absolute top-1 left-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide shadow">
                      <Star size={10} fill="currentColor" /> Main
                    </span>
                  )}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold tabular-nums">
                    #{i + 1}
                  </span>
                </div>

                {/* Category dropdown */}
                <div className="bg-white dark:bg-slate-900 px-1.5 pt-1.5">
                  <CategorySelect imageId={img.id} boatId={boat.id} current={img.category} />
                </div>

                {/* Always-visible action bar — reorder + star + delete.
                    Touch-friendly, no hover required. */}
                <div className="bg-white dark:bg-slate-900 px-1.5 py-1.5 flex items-center justify-between gap-1 border-t border-slate-100 dark:border-slate-800 mt-1.5">
                  <div className="flex items-center gap-0.5">
                    <form action={moveBoatImageAction}>
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="boat_id" value={boat.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={i === 0}
                        className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-950 hover:text-cyan-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title="Move earlier"
                        aria-label="Move earlier"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </form>
                    <form action={moveBoatImageAction}>
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="boat_id" value={boat.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        disabled={i === images.length - 1}
                        className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:bg-cyan-50 dark:hover:bg-cyan-950 hover:text-cyan-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title="Move later"
                        aria-label="Move later"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </form>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {img.is_primary ? (
                      <span
                        className="p-1.5 text-amber-500"
                        title="This is the catalogue + PDF main photo"
                      >
                        <Star size={14} fill="currentColor" />
                      </span>
                    ) : (
                      <form action={setPrimaryBoatImageAction}>
                        <input type="hidden" name="id" value={img.id} />
                        <input type="hidden" name="boat_id" value={boat.id} />
                        <button
                          type="submit"
                          className="p-1.5 rounded text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950 hover:text-amber-600"
                          title="Set as main photo (catalogue + PDF hero)"
                          aria-label="Set as main photo"
                        >
                          <Star size={14} />
                        </button>
                      </form>
                    )}
                    <form action={deleteBoatImageAction}>
                      <input type="hidden" name="id" value={img.id} />
                      <input type="hidden" name="boat_id" value={boat.id} />
                      <button
                        type="submit"
                        className="p-1.5 rounded text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-600"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <BoatImageUploader boatId={boat.id} slotsLeft={Math.max(0, 10 - images.length)} />
      </section>

      <section className="mt-6 ix-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Pricing</h2>
          <Link href="/emails/boat-rental/admin/pricing" className="text-xs text-cyan-700 hover:underline">
            Edit pricing →
          </Link>
        </div>
        {pricing.length === 0 ? (
          <p className="text-sm text-slate-500">No prices set yet. Add them on the Pricing tab.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-sm">
            {(['weekday', 'weekend', 'season'] as const).map(tier => {
              const row = pricing.find(p => p.tier === tier);
              return (
                <div key={tier} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{tier}</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">
                    {row ? `EGP ${Number(row.amount_egp).toLocaleString()}` : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6 ix-card p-5 border-rose-200 bg-rose-50/30">
        <h2 className="font-semibold text-rose-800 text-sm mb-2">Danger zone</h2>
        <form action={deleteBoatAction}>
          <input type="hidden" name="id" value={boat.id} />
          <button type="submit" className="inline-flex items-center gap-1 text-xs text-rose-700 hover:text-rose-900">
            <Trash2 size={12} /> Delete boat (archives if bookings exist)
          </button>
        </form>
      </section>
    </>
  );
}
