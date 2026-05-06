import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Wifi, MessageCircle, MapPin, Clock, Phone, BedDouble, ArrowRight } from 'lucide-react';
import { loadBoardingByToken } from '@/lib/beithady/engagement/boarding-pass';
import { supabaseAdmin } from '@/lib/supabase';
import { validateDineToken } from '@/lib/beithady/fnb/token-validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function BoardingPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bundle = await loadBoardingByToken(token);
  if (!bundle) notFound();

  const sb = supabaseAdmin();

  // Mint signed URLs for the gallery (private bucket)
  const galleryUrls: Array<{ id: string; url: string; caption: string | null }> = [];
  for (const a of bundle.gallery) {
    if (a.public_url) {
      galleryUrls.push({ id: a.id, url: a.public_url, caption: a.ai_caption });
      continue;
    }
    const { data } = await sb.storage.from('beithady-gallery').createSignedUrl(a.storage_path, 3600);
    if (data?.signedUrl) galleryUrls.push({ id: a.id, url: data.signedUrl, caption: a.ai_caption });
  }

  const waLink = `https://wa.me/${bundle.host_phone_e164.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi Beit Hady — about my stay at ${bundle.listing_nickname || 'the apartment'} (${bundle.reservation_id})`)}`;

  const fnb = await validateDineToken(token);

  return (
    <div style={{ backgroundColor: '#F5F1E8', minHeight: '100vh' }}>
      <div className="max-w-2xl mx-auto px-5 py-10 space-y-6">
        {/* Brand header */}
        <header className="text-center space-y-2">
          <div className="relative w-32 h-16 mx-auto">
            <Image src="/brand/beithady/wordmark.jpg" alt="Beit Hady" fill className="object-contain" sizes="128px" priority />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--bh-navy, #1E2D4A)', fontFamily: 'Cormorant Garamond, Playfair Display, ui-serif, Georgia, serif' }}>
            Welcome, {bundle.guest_first_name}
          </h1>
          <p className="text-sm" style={{ color: '#5F7397' }}>
            {bundle.listing_nickname || 'Your apartment'}{bundle.building_code ? ` · ${bundle.building_code}` : ''}
          </p>
        </header>

        {/* Stay details */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>Your stay</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Clock size={14} className="text-slate-400 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-500">Check-in</dt>
                <dd className="font-medium">{bundle.check_in || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock size={14} className="text-slate-400 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-500">Check-out</dt>
                <dd className="font-medium">{bundle.check_out || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BedDouble size={14} className="text-slate-400 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-500">Nights</dt>
                <dd className="font-medium">{bundle.nights ?? '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-slate-400 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-500">Source</dt>
                <dd className="font-medium capitalize">{(bundle.source || 'direct').replace('2', '')}</dd>
              </div>
            </div>
          </dl>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-3">
          <a href={waLink} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white p-4 flex flex-col items-center gap-1 transition">
            <MessageCircle size={20} />
            <span className="text-sm font-semibold">Message host</span>
            <span className="text-[11px] opacity-90">WhatsApp · 24/7</span>
          </a>
          <a href={`tel:${bundle.host_phone_e164}`} className="rounded-2xl bg-white hover:bg-stone-50 ring-1 ring-slate-200 p-4 flex flex-col items-center gap-1 transition" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>
            <Phone size={20} />
            <span className="text-sm font-semibold">Call host</span>
            <span className="text-[11px] text-slate-500">{bundle.host_phone_e164}</span>
          </a>
        </section>

        {/* F&B — Order Food CTA (only shown when building has F&B enabled and guest is checked in) */}
        {fnb.ok && (
          <a
            href={`/dine/${token}`}
            className="block mt-4 mx-6 text-center rounded-full py-4 font-semibold"
            style={{ background: '#0F3F58', color: '#FAF8F4' }}
          >
            🍽️ Order Food
          </a>
        )}

        {/* F&B — Printable QR code for ops to stick on the apartment fridge */}
        {fnb.ok && (
          <section className="mt-6 mx-6 print:mx-0 print:mt-12">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-center mb-2" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>
              In-Room Dining QR
            </h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/dine/${token}/qr.svg`}
              alt="Scan to order food"
              className="w-48 h-48 mx-auto"
            />
            <p className="text-xs text-center mt-2 text-slate-500">
              Print and place in the apartment for guests to scan.
            </p>
          </section>
        )}

        {/* Gallery */}
        {galleryUrls.length > 0 && (
          <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>Your apartment</h2>
            <div className="grid grid-cols-3 gap-2">
              {galleryUrls.map(g => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={g.id}
                  src={g.url}
                  alt={g.caption || 'apartment photo'}
                  className="rounded-lg aspect-square object-cover w-full"
                />
              ))}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>Quick FAQ</h2>
          <FaqRow icon={Wifi} title="Wi-Fi" body="Network name + password are on the welcome card on the kitchen counter. Reset router by unplugging for 30s." />
          <FaqRow icon={MapPin} title="Building entry" body={bundleEntryHelp(bundle.building_code)} />
          <FaqRow icon={Clock} title="Check-in / check-out times" body="Standard: 3pm in / 11am out. Early/late available — see add-ons below." />
          <FaqRow icon={Phone} title="Anything's not perfect?" body="Message the host on WhatsApp — we reply within minutes 24/7." />
        </section>

        {/* Upsell offers */}
        {bundle.upsell_skus.length > 0 && (
          <section className="rounded-2xl bg-white shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>Make your stay nicer</h2>
            <p className="text-xs text-slate-500">Tap "Request" to send the host your choice — they'll confirm in WhatsApp.</p>
            <ul className="divide-y divide-slate-100">
              {bundle.upsell_skus.map(s => {
                const reqLink = `https://wa.me/${bundle.host_phone_e164.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I'd like to add: ${s.name} ($${s.price_usd.toFixed(0)}) to my Beit Hady stay (${bundle.reservation_id}).`)}`;
                return (
                  <li key={s.sku} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>{s.name}</div>
                      <p className="text-xs text-slate-600 mt-0.5">{s.description}</p>
                      <div className="text-sm font-bold tabular-nums mt-1" style={{ color: 'var(--bh-gold, #D4A93A)' }}>${s.price_usd.toFixed(0)}</div>
                    </div>
                    <a href={reqLink} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: 'var(--bh-navy, #1E2D4A)' }}>
                      Request <ArrowRight size={12} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="text-center text-[11px] pt-4" style={{ color: '#5F7397' }}>
          Beit Hady · A Lime Investments subsidiary · Powered by FM+
          <div className="mt-1 text-slate-400">
            This page expires {new Date(bundle.expires_at).toLocaleDateString()}.
          </div>
        </footer>
      </div>
    </div>
  );
}

function FaqRow({ icon: Icon, title, body }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0" style={{ color: 'var(--bh-blue, #5F7397)' }}>
        <Icon size={14} />
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--bh-navy, #1E2D4A)' }}>{title}</div>
        <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}

function bundleEntryHelp(buildingCode: string | null): string {
  switch (buildingCode) {
    case 'BH-26': return 'Ground-floor concierge — mention your name. Apartment key with concierge, ID required.';
    case 'BH-73': return 'Door code on file — host will WhatsApp it 1h before check-in. Apartment on 2nd floor.';
    case 'BH-435': return 'A1 Hospitality reception is open 24/7 with your room card + welcome envelope.';
    case 'BH-OK': return 'Ground-floor doorman — mention "Beit Hady". Keys handed by the host on arrival.';
    case 'BH-34': return 'Building entry via concierge — mention your name and apartment number.';
    default: return 'The host will message you with exact entry instructions 1h before check-in.';
  }
}
