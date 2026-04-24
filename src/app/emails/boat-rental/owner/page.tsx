import Link from 'next/link';
import Image from 'next/image';
import { Ship, Calendar, ArrowRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { signedImageUrl } from '@/lib/boat-rental/storage';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../_components/tabs';

export const dynamic = 'force-dynamic';

type BoatLite = {
  id: string;
  name: string;
  capacity_guests: number;
  status: string;
};

export default async function OwnerLanding() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];

  const sb = supabaseAdmin();
  const boatsRes = ownerIds.length
    ? await sb
        .from('boat_rental_boats')
        .select('id, name, capacity_guests, status')
        .in('owner_id', ownerIds)
        .order('name')
    : { data: [] };
  const boats = ((boatsRes.data as unknown) as BoatLite[] | null) || [];
  const boatIds = boats.map(b => b.id);
  const today = cairoTodayStr();

  // Next upcoming booking per boat + MTD paid amount.
  const [upcomingRes, mtdRes, imagesRes] = await Promise.all([
    boatIds.length
      ? sb
          .from('boat_rental_reservations')
          .select('boat_id, booking_date, status, price_egp_snapshot')
          .in('boat_id', boatIds)
          .in('status', ['confirmed', 'details_filled'])
          .gte('booking_date', today)
          .order('booking_date', { ascending: true })
      : Promise.resolve({ data: [] }),
    boatIds.length
      ? sb
          .from('boat_rental_payments')
          .select(
            `
            amount_egp, paid_at,
            reservation:boat_rental_reservations!inner ( boat_id )
          `
          )
          .gte('paid_at', today.slice(0, 8) + '01')
      : Promise.resolve({ data: [] }),
    boatIds.length
      ? sb.from('boat_rental_boat_images').select('boat_id, storage_path').in('boat_id', boatIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nextByBoat = new Map<string, { booking_date: string; status: string; price: number }>();
  for (const row of (upcomingRes.data as Array<{ boat_id: string; booking_date: string; status: string; price_egp_snapshot: string | number }> | null) || []) {
    if (!nextByBoat.has(row.boat_id)) {
      nextByBoat.set(row.boat_id, {
        booking_date: row.booking_date,
        status: row.status,
        price: Number(row.price_egp_snapshot),
      });
    }
  }

  const mtdByBoat = new Map<string, number>();
  for (const row of (mtdRes.data as Array<{ amount_egp: string | number; reservation: { boat_id: string } }> | null) || []) {
    const k = row.reservation.boat_id;
    mtdByBoat.set(k, (mtdByBoat.get(k) || 0) + Number(row.amount_egp));
  }

  const firstImgByBoat = new Map<string, string>();
  for (const r of (imagesRes.data as Array<{ boat_id: string; storage_path: string }> | null) || []) {
    if (!firstImgByBoat.has(r.boat_id)) firstImgByBoat.set(r.boat_id, r.storage_path);
  }
  const previews = new Map<string, string | null>();
  await Promise.all(
    [...firstImgByBoat.entries()].map(async ([bid, path]) => {
      previews.set(bid, await signedImageUrl(path));
    })
  );

  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Owner Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">My Boats</h1>
          <p className="text-sm text-slate-500 mt-1">Next trip and this month&apos;s revenue at a glance.</p>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner" />

      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boats.length === 0 && (
          <div className="ix-card p-6 text-sm text-slate-500 text-center md:col-span-3">
            No boats linked to your account yet.
          </div>
        )}
        {boats.map(b => {
          const next = nextByBoat.get(b.id);
          const mtd = mtdByBoat.get(b.id) || 0;
          const preview = previews.get(b.id) || null;
          return (
            <Link
              key={b.id}
              href={`/emails/boat-rental/owner/calendar?boat_id=${b.id}`}
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
                <p className="text-xs text-slate-500 mt-0.5">Capacity {b.capacity_guests}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">Next trip</div>
                    <div className="font-semibold">
                      {next ? next.booking_date : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">MTD revenue</div>
                    <div className="font-semibold tabular-nums">
                      EGP {mtd.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-700">
                  <Calendar size={12} /> View calendar
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
