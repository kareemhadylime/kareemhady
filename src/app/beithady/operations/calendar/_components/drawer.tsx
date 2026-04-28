'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  X, Info, User, Tag, DollarSign, MessageCircle, Ticket,
  ClipboardList, Sparkles, Megaphone, History, ExternalLink, Star,
  CheckCircle2, Circle, AlertCircle,
} from 'lucide-react';
import type { ReservationDetail, PastStay, ReservationMessage } from '@/lib/beithady/operations/reservation-detail';
import { PaymentActions } from './payment-actions';
import { BoardingPassShare } from './boarding-pass-share';

type TabId = 'overview' | 'guest' | 'channel' | 'payment' | 'comms'
  | 'checkin' | 'tasks' | 'upsells' | 'attribution' | 'audit';

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'overview',    label: 'Overview',      icon: Info },
  { id: 'guest',       label: 'Guest',         icon: User },
  { id: 'channel',     label: 'Channel',       icon: Tag },
  { id: 'payment',     label: 'Payment',       icon: DollarSign },
  { id: 'comms',       label: 'Communication', icon: MessageCircle },
  { id: 'checkin',     label: 'Check-in',      icon: Ticket },
  { id: 'tasks',       label: 'Tasks',         icon: ClipboardList },
  { id: 'upsells',     label: 'Upsells',       icon: Sparkles },
  { id: 'attribution', label: 'Attribution',   icon: Megaphone },
  { id: 'audit',       label: 'Audit log',     icon: History },
];

export function ReservationDrawer({ detail }: { detail: ReservationDetail }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const close = () => {
    const next = new URLSearchParams(sp?.toString() || '');
    next.delete('reservation');
    router.push(`?${next.toString()}`);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={close}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-slate-900 z-50 shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col"
        role="dialog"
      >
        <DrawerHeader detail={detail} onClose={close} />
        <LoyaltyHeaderBanner detail={detail} />
        <div className="flex flex-1 overflow-hidden">
          <nav className="w-12 sm:w-44 shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto py-2">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition
                    ${active
                      ? 'bg-[var(--bh-cream)] dark:bg-slate-800 text-[var(--bh-navy)] dark:text-amber-200 font-semibold border-r-2 border-[var(--bh-gold)]'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {activeTab === 'overview' && <TabOverview detail={detail} />}
            {activeTab === 'guest' && <TabGuest detail={detail} />}
            {activeTab === 'channel' && <TabChannel detail={detail} />}
            {activeTab === 'payment' && <TabPayment detail={detail} />}
            {activeTab === 'comms' && <TabComms detail={detail} />}
            {activeTab === 'checkin' && <TabCheckin detail={detail} />}
            {activeTab === 'tasks' && <TabTasks detail={detail} />}
            {activeTab === 'upsells' && <TabUpsells detail={detail} />}
            {activeTab === 'attribution' && <TabAttribution detail={detail} />}
            {activeTab === 'audit' && <TabAudit detail={detail} />}
          </div>
        </div>
      </aside>
    </>
  );
}

// =================================================================== Header

function DrawerHeader({ detail, onClose }: { detail: ReservationDetail; onClose: () => void }) {
  const r = detail.base;
  return (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          Res. {r.confirmation_code || r.reservation_id.slice(0, 12)}
        </div>
        <div className="text-sm font-bold truncate" style={{ color: 'var(--bh-navy)' }}>
          {r.guest_name || 'Guest'} · {r.listing_nickname || r.listing_id}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
          <StatusPill status={r.status} />
          <span>{r.check_in_date} → {r.check_out_date}</span>
          <span>· {r.nights}n</span>
          {r.risk_score != null && <RiskPill score={r.risk_score} />}
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function LoyaltyHeaderBanner({ detail }: { detail: ReservationDetail }) {
  const tier = (detail.base.loyalty_tier || '').toLowerCase();
  const isVip = detail.base.is_vip;
  if (!isVip && !['platinum', 'gold', 'silver'].includes(tier)) return null;

  const tierConfig: Record<string, { color: string; bg: string; perks: string[] }> = {
    platinum: { color: '#1E2D4A', bg: '#E5E7EB', perks: ['Free upgrade if available', 'Priority check-in', 'Welcome amenity', 'Late checkout free'] },
    vip:      { color: '#1E2D4A', bg: '#FCE7F3', perks: ['Manager greeting', 'Comp upgrade', 'Welcome amenity', 'Direct line to ops'] },
    gold:     { color: '#92400E', bg: '#FEF3C7', perks: ['Welcome amenity', 'Late checkout free', '10% off upsells'] },
    silver:   { color: '#1E40AF', bg: '#DBEAFE', perks: ['Welcome note', '5% off upsells'] },
  };
  const key = isVip ? 'vip' : tier;
  const cfg = tierConfig[key];
  if (!cfg) return null;

  return (
    <div
      className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-[11px] flex items-center gap-2"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <Star size={12} className="shrink-0" />
      <span className="font-semibold uppercase tracking-wider">{key}</span>
      <span className="opacity-80">·</span>
      <span className="truncate">{cfg.perks.join(' · ')}</span>
    </div>
  );
}

// =================================================================== Overview

function TabOverview({ detail }: { detail: ReservationDetail }) {
  const r = detail.base;
  return (
    <div className="space-y-3">
      <Section title="Overview">
        <Row label="Status">
          <StatusPill status={r.status} />
        </Row>
        <Row label="Channel">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: r.channel_color }} />
            {r.channel_label}
          </span>
        </Row>
        <Row label="Guests">{r.guest_count || '—'}</Row>
        <Row label="Listing">
          {r.listing_nickname || r.listing_id}
        </Row>
        <Row label="Check-in">{r.check_in_date}</Row>
        <Row label="Check-out">{r.check_out_date}</Row>
        <Row label="Nights">{r.nights}</Row>
      </Section>

      <Section title="Money">
        <Row label="Host payout">{fmtMoney(r.host_payout, r.currency)}</Row>
        <Row label="Fare">{fmtMoney(r.fare_accommodation, r.currency)}</Row>
        <Row label="Commission">{fmtMoney(r.commission, r.currency)}</Row>
        <Row label="Cleaning">{fmtMoney(r.cleaning_fee, r.currency)}</Row>
        <Row label="Payment status">
          <PaymentPill status={r.payment_status} />
        </Row>
        {r.payment_balance_cents != null && r.payment_balance_cents > 0 && (
          <Row label="Balance due">
            <span className="text-rose-600 font-semibold">
              {fmtMoney(r.payment_balance_cents / 100, r.payment_currency || r.currency)}
            </span>
          </Row>
        )}
      </Section>

      {detail.messages.length > 0 && (
        <Section title={`Recent messages (${detail.messages.length})`}>
          <div className="space-y-1.5">
            {detail.messages.slice(0, 3).map(m => <MessageRow key={m.id} m={m} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

// =================================================================== Guest

function TabGuest({ detail }: { detail: ReservationDetail }) {
  const r = detail.base;
  return (
    <div className="space-y-3">
      <Section title="Guest profile">
        <Row label="Name">{r.guest_name || '—'}</Row>
        <Row label="Email">{r.guest_email || '—'}</Row>
        <Row label="Phone">{r.guest_phone || '—'}</Row>
        <Row label="Loyalty tier">{r.loyalty_tier || '—'}</Row>
        <Row label="Lifetime stays">{r.lifetime_stays ?? '—'}</Row>
      </Section>
      {detail.pastStays.length > 0 && (
        <Section title={`Past stays (${detail.pastStays.length})`}>
          <div className="space-y-2">
            {detail.pastStays.map(p => <PastStayRow key={p.reservation_id} stay={p} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

function PastStayRow({ stay }: { stay: PastStay }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded p-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold truncate">{stay.listing_nickname || '—'}</span>
        <span className="text-slate-500 shrink-0">{stay.check_in_date} → {stay.check_out_date}</span>
      </div>
      <div className="flex items-center gap-2 text-slate-500 mt-1">
        {stay.building_code && <span className="px-1 py-px bg-slate-100 dark:bg-slate-800 rounded">{stay.building_code}</span>}
        {stay.channel && <span>{stay.channel}</span>}
        {stay.rating != null && (
          <span className="inline-flex items-center gap-0.5 text-amber-600">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={9} fill={i < (stay.rating || 0) ? 'currentColor' : 'none'} />
            ))}
          </span>
        )}
      </div>
      {stay.review_text && (
        <p className="mt-1 italic text-slate-600 dark:text-slate-400 line-clamp-2">
          &ldquo;{stay.review_text}&rdquo;
        </p>
      )}
    </div>
  );
}

// =================================================================== Channel

function TabChannel({ detail }: { detail: ReservationDetail }) {
  const r = detail.base;
  return (
    <div className="space-y-3">
      <Section title="Channel & source">
        <Row label="Channel">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: r.channel_color }} />
            {r.channel_label}
          </span>
        </Row>
        <Row label="Source">{r.source_label || '—'}</Row>
        <Row label="Confirmation #">
          <code className="text-[10px]">{r.confirmation_code || '—'}</code>
        </Row>
        <Row label="Guesty Res ID">
          <code className="text-[10px]">{r.reservation_id}</code>
        </Row>
      </Section>
      <Section title="Money breakdown">
        <Row label="Fare">{fmtMoney(r.fare_accommodation, r.currency)}</Row>
        <Row label="Commission">{fmtMoney(r.commission, r.currency)}</Row>
        <Row label="Cleaning fee">{fmtMoney(r.cleaning_fee, r.currency)}</Row>
        <Row label="Host payout">
          <span className="font-semibold">{fmtMoney(r.host_payout, r.currency)}</span>
        </Row>
      </Section>
    </div>
  );
}

// =================================================================== Payment

function TabPayment({ detail }: { detail: ReservationDetail }) {
  const r = detail.base;
  return (
    <div className="space-y-3">
      {r.flagged_unpaid && (
        <div className="border-l-4 border-rose-500 bg-rose-50/60 dark:bg-rose-900/10 p-2 text-[11px] text-rose-900 dark:text-rose-200 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>Unpaid · check-in within 7 days. Mark paid manually if collected outside the channel.</span>
        </div>
      )}
      <Section title="Payment status">
        <Row label="Status"><PaymentPill status={r.payment_status} /></Row>
        <Row label="Total">{fmtMoney(r.host_payout != null && r.commission != null ? Number(r.host_payout) + Number(r.commission) : null, r.currency)}</Row>
        <Row label="Currency">{r.payment_currency || r.currency}</Row>
        {r.payment_balance_cents != null && (
          <Row label="Balance">
            <span className={r.payment_balance_cents > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600'}>
              {fmtMoney(r.payment_balance_cents / 100, r.payment_currency || r.currency)}
            </span>
          </Row>
        )}
      </Section>
      <Section title="Source">
        <p className="text-[11px] text-slate-500 leading-snug">
          For OTAs (Airbnb, Booking.com, Vrbo, Expedia, Hopper), the channel collects payment upfront —
          status defaults to <em>paid</em> on confirmation. For direct/website bookings, balance is
          reconciled against Stripe via the recompute action below.
        </p>
      </Section>
      <Section title="Actions">
        <PaymentActions
          reservationId={r.reservation_id}
          currentStatus={r.payment_status}
          totalCents={r.host_payout != null && r.commission != null
            ? Math.round((Number(r.host_payout) + Number(r.commission)) * 100)
            : null}
          currency={r.currency}
        />
      </Section>
    </div>
  );
}

// =================================================================== Communication

function TabComms({ detail }: { detail: ReservationDetail }) {
  const conv = detail.conversation;
  return (
    <div className="space-y-3">
      {conv && (
        <Section title="Conversation">
          <Row label="Channel">{conv.channel}</Row>
          {conv.sla_breach && (
            <Row label="SLA">
              <span className="text-rose-600">Breached ({conv.sla_age_seconds ? `${Math.round(conv.sla_age_seconds / 60)}m` : '—'})</span>
            </Row>
          )}
          {conv.ai_kill_switch && (
            <Row label="AI auto-reply">
              <span className="text-amber-600">Disabled for this thread</span>
            </Row>
          )}
          <div className="pt-1">
            <Link
              href={`/beithady/communication/unified?conversation=${conv.id}`}
              className="ix-btn-secondary !text-xs"
            >
              <ExternalLink size={11} /> Open full thread
            </Link>
          </div>
        </Section>
      )}
      {detail.messages.length > 0 ? (
        <Section title={`Messages (${detail.messages.length})`}>
          <div className="space-y-1.5">
            {detail.messages.map(m => <MessageRow key={m.id} m={m} />)}
          </div>
        </Section>
      ) : (
        <EmptyHint icon={MessageCircle} text="No messages yet for this reservation." />
      )}
    </div>
  );
}

function MessageRow({ m }: { m: ReservationMessage }) {
  const isOut = m.direction === 'outbound';
  return (
    <div className={`p-2 rounded text-[11px] border ${isOut
      ? 'border-cyan-200 bg-cyan-50/40 dark:bg-cyan-900/10 dark:border-cyan-800'
      : 'border-slate-200 bg-slate-50/40 dark:bg-slate-800/40 dark:border-slate-700'}`}>
      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500">
        <span className="font-semibold">{m.from_full_name || (isOut ? 'Host' : 'Guest')}</span>
        {m.is_automatic && <span className="text-violet-600">AI</span>}
        {m.channel && <span>· {m.channel}</span>}
        <span className="ml-auto">{m.sent_at || m.created_at ? new Date(m.sent_at || m.created_at).toLocaleString() : ''}</span>
      </div>
      <div className="line-clamp-3 whitespace-pre-wrap">{m.body || '(no body)'}</div>
    </div>
  );
}

// =================================================================== Check-in

function TabCheckin({ detail }: { detail: ReservationDetail }) {
  const r = detail.base;
  return (
    <div className="space-y-3">
      <Section title="Pre-arrival message">
        <Row label="Sent">
          {r.prearrival_sent_at
            ? <span className="text-emerald-600">{new Date(r.prearrival_sent_at).toLocaleString()}</span>
            : <span className="text-amber-600">Not sent</span>}
        </Row>
      </Section>
      <Section title="Boarding pass">
        <Row label="Created">{r.boarding_pass_exists ? <span className="text-emerald-600">Yes</span> : <span className="text-slate-500">No</span>}</Row>
        <Row label="Viewed">
          {r.boarding_viewed_at
            ? <span className="text-emerald-600">{new Date(r.boarding_viewed_at).toLocaleString()}</span>
            : <span className="text-slate-500">Not yet</span>}
        </Row>
        {r.boarding_pass_exists && (
          <BoardingPassShare
            reservationId={r.reservation_id}
            guestPhone={r.guest_phone}
            guestName={r.guest_name}
          />
        )}
      </Section>
      <p className="text-[11px] text-slate-500 leading-snug">
        Smart-lock codes + ID upload tracking land in V2.
      </p>
    </div>
  );
}

// =================================================================== Tasks

function TabTasks({ detail }: { detail: ReservationDetail }) {
  if (detail.tasks.length === 0) {
    return <EmptyHint icon={ClipboardList} text="No tasks scoped to this reservation." />;
  }
  return (
    <div className="space-y-1.5">
      {detail.tasks.map(t => (
        <div key={t.id} className="border border-slate-200 dark:border-slate-700 rounded p-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            {t.status === 'completed'
              ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              : <Circle size={12} className="text-slate-400 shrink-0" />}
            <span className="font-semibold flex-1 truncate">{t.title}</span>
            {t.priority && <span className="text-[9px] uppercase px-1 py-px rounded bg-slate-100 dark:bg-slate-800">{t.priority}</span>}
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-[10px] mt-1">
            <span>{t.type}</span>
            {t.due_at && <span>· due {new Date(t.due_at).toLocaleDateString()}</span>}
            {t.completed_at && <span className="text-emerald-600">· completed {new Date(t.completed_at).toLocaleDateString()}</span>}
          </div>
          {t.notes && <p className="mt-1 text-slate-600 dark:text-slate-400 line-clamp-2">{t.notes}</p>}
        </div>
      ))}
    </div>
  );
}

// =================================================================== Upsells

function TabUpsells({ detail }: { detail: ReservationDetail }) {
  if (detail.upsells.length === 0) {
    return <EmptyHint icon={Sparkles} text="No upsell offers for this reservation." />;
  }
  return (
    <div className="space-y-1.5">
      {detail.upsells.map(u => (
        <div key={u.id} className="border border-slate-200 dark:border-slate-700 rounded p-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-px rounded text-[10px] uppercase tracking-wide ${
              u.status === 'accepted' || u.status === 'paid'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                : u.status === 'declined'
                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
            }`}>{u.status}</span>
            {u.total_usd != null && <span className="font-semibold">${u.total_usd}</span>}
            <span className="text-slate-500 ml-auto">{new Date(u.created_at).toLocaleDateString()}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Offered: {u.offered_skus.join(', ')}
          </div>
          {u.accepted_skus && u.accepted_skus.length > 0 && (
            <div className="text-[10px] text-emerald-600 mt-0.5">
              Accepted: {u.accepted_skus.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =================================================================== Attribution

function TabAttribution({ detail }: { detail: ReservationDetail }) {
  if (!detail.adsAttribution && !detail.leadAttribution) {
    return <EmptyHint icon={Megaphone} text="No ad or lead attribution matched to this reservation." />;
  }
  return (
    <div className="space-y-3">
      {detail.adsAttribution && (
        <Section title="Ad attribution (Phase H)">
          <Row label="Platform">{detail.adsAttribution.platform}</Row>
          <Row label="Campaign #">{detail.adsAttribution.campaign_id ?? '—'}</Row>
          <Row label="Ad #">{detail.adsAttribution.ad_id ?? '—'}</Row>
          <Row label="Form">{detail.adsAttribution.form_name || '—'}</Row>
          <Row label="Building interest">{detail.adsAttribution.building_interest || '—'}</Row>
          <Row label="Matched at">
            {detail.adsAttribution.matched_at ? new Date(detail.adsAttribution.matched_at).toLocaleString() : '—'}
          </Row>
        </Section>
      )}
      {detail.leadAttribution && (
        <Section title="Lead pipeline (Phase I)">
          <Row label="Source">{detail.leadAttribution.source}</Row>
          <Row label="Stage">{detail.leadAttribution.stage}</Row>
          <Row label="Rating">{detail.leadAttribution.rating ?? '—'}</Row>
          <Row label="Contacted">
            {detail.leadAttribution.contacted_at ? new Date(detail.leadAttribution.contacted_at).toLocaleString() : '—'}
          </Row>
          <Row label="Quoted">
            {detail.leadAttribution.quoted_at ? new Date(detail.leadAttribution.quoted_at).toLocaleString() : '—'}
          </Row>
          <Row label="Booked">
            {detail.leadAttribution.booked_at ? new Date(detail.leadAttribution.booked_at).toLocaleString() : '—'}
          </Row>
        </Section>
      )}
    </div>
  );
}

// =================================================================== Audit

function TabAudit({ detail }: { detail: ReservationDetail }) {
  if (detail.audit.length === 0) {
    return <EmptyHint icon={History} text="No audit log entries yet for this reservation." />;
  }
  return (
    <div className="space-y-1">
      {detail.audit.map(a => (
        <div key={a.id} className="border-l-2 border-slate-300 dark:border-slate-600 pl-2 py-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{a.action}</span>
            <span className="text-[9px] uppercase px-1 py-px bg-slate-100 dark:bg-slate-800 rounded">{a.module}</span>
            <span className="ml-auto text-[10px] text-slate-500">
              {new Date(a.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// =================================================================== Shared bits

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-slate-500 w-32 shrink-0">{label}</span>
      <span className="flex-1 min-w-0 truncate">{children}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const cls = status === 'confirmed'
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
    : status === 'inquiry'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
      : status === 'canceled'
        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-800';
  return <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{status || '—'}</span>;
}

function PaymentPill({ status }: { status: string | null }) {
  if (!status) return <span>—</span>;
  const cls: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    unpaid: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
    n_a: 'bg-slate-100 text-slate-500 dark:bg-slate-800',
  };
  return <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ${cls[status] || cls.n_a}`}>{status}</span>;
}

function RiskPill({ score }: { score: number }) {
  const cls = score >= 7
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200'
    : score >= 4
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  return (
    <span className={`px-1.5 py-px rounded text-[10px] font-semibold ${cls}`} title={`AI risk score (1-10)`}>
      Risk {score}
    </span>
  );
}

function EmptyHint({ icon: Icon, text }: { icon: React.ComponentType<{ size?: number; className?: string }>; text: string }) {
  return (
    <div className="text-center text-slate-500 py-6">
      <Icon size={20} className="mx-auto mb-1 text-slate-300" />
      <div className="text-[11px]">{text}</div>
    </div>
  );
}

function fmtMoney(v: number | null | undefined, currency: string | null | undefined): string {
  if (v == null) return '—';
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${cur} ${Math.round(v).toLocaleString()}`;
  }
}
