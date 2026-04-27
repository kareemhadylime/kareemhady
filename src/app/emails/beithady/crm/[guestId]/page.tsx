import { notFound } from 'next/navigation';
import {
  Mail,
  Phone,
  Globe2,
  Crown,
  Star,
  Calendar,
  MessageCircle,
  Pin,
  Trash2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  StickyNote,
  Languages,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { loadGuestBundle } from '@/lib/beithady/crm/guest-loader';
import { tierConfig } from '@/lib/beithady/crm/loyalty';
import { flagFor } from '@/lib/beithady/crm/guest-list';
import { fmtCairoDate, fmtCairoDateTime } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import {
  toggleVipAction,
  addNoteAction,
  deleteNoteAction,
  regenerateAiSummaryAction,
} from '../actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);
}

export default async function BeithadyGuestProfilePage({
  params,
}: {
  params: Promise<{ guestId: string }>;
}) {
  await requireBeithadyPermission('crm', 'read');
  const { guestId } = await params;
  const bundle = await loadGuestBundle(guestId);
  if (!bundle) notFound();

  const { profile: g, notes, timeline } = bundle;
  const tier = tierConfig(g.loyalty_tier);

  // Bucket events by type for the section panes
  const bookings = timeline.events.filter(e => e.type === 'booking');
  const messages = timeline.events.filter(e => e.type === 'message');
  const reviews = timeline.events.filter(e => e.type === 'review');

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'CRM', href: '/emails/beithady/crm' },
        { label: g.full_name || '(unnamed)' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · CRM · Profile"
        title={g.full_name || '(unnamed guest)'}
        subtitle={`Guesty ID ${g.guesty_guest_id?.slice(0, 12) || '(none — synthesized from email/phone)'}`}
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <form action={toggleVipAction}>
                <input type="hidden" name="guest_id" value={g.id} />
                <button
                  type="submit"
                  className={
                    g.vip
                      ? 'ix-btn-primary text-xs'
                      : 'ix-btn-secondary text-xs'
                  }
                >
                  <Crown size={12} /> {g.vip ? 'Remove VIP' : 'Mark VIP'}
                </button>
              </form>
              <form action={regenerateAiSummaryAction}>
                <input type="hidden" name="guest_id" value={g.id} />
                <button type="submit" className="ix-btn-secondary text-xs">
                  <Sparkles size={12} /> Regen AI summary
                </button>
              </form>
            </div>
            <p className="text-[10px] text-slate-400">
              Last updated {fmtCairoDateTime(g.updated_at)}
            </p>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Identity card */}
        <section className="ix-card p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <span className="text-2xl">{flagFor(g.residence_country)}</span>
            Identity
          </h2>
          <div className="space-y-2 text-sm">
            <Row icon={Mail} label="Email" value={g.email || '—'} mono />
            <Row icon={Phone} label="Phone" value={g.phone_e164 || '—'} mono />
            <Row icon={Globe2} label="Country" value={g.residence_country || '—'} />
            <Row icon={Languages} label="Language" value={g.language || '—'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: tier.display_color + '22', color: tier.display_color }}
            >
              {tier.emoji} {tier.label}
            </span>
            {g.vip && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                <Crown size={10} /> VIP
              </span>
            )}
            {g.tags?.map(t => (
              <span key={t} className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                #{t}
              </span>
            ))}
          </div>
        </section>

        {/* Lifetime stats */}
        <section className="ix-card p-5 space-y-4">
          <h2 className="font-semibold">Lifetime</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Stays" value={String(g.lifetime_stays)} />
            <Stat label="Nights" value={String(g.lifetime_nights)} />
            <Stat label="Spend USD" value={fmtMoney(Number(g.lifetime_spend_usd))} />
            <Stat
              label="Sources"
              value={
                Array.isArray((g.source_signals as { sources?: string[] }).sources)
                  ? ((g.source_signals as { sources?: string[] }).sources || []).join(' · ') || '—'
                  : '—'
              }
            />
            <Stat label="First seen" value={g.first_seen ? fmtCairoDate(g.first_seen) : '—'} />
            <Stat label="Last seen" value={g.last_seen ? fmtCairoDate(g.last_seen) : '—'} />
            <Stat
              label="Next arrival"
              value={g.next_arrival_at ? fmtCairoDate(g.next_arrival_at) : '—'}
            />
            <Stat label="Marketing opt-in" value={g.marketing_opt_in ? 'yes' : 'no'} />
          </div>
        </section>

        {/* AI summary */}
        <section className="ix-card p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles size={14} className="text-yellow-600" />
            AI summary
          </h2>
          {g.ai_summary ? (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{g.ai_summary}</p>
              <p className="text-[11px] text-slate-400">
                Generated {g.ai_summary_updated_at ? fmtCairoDateTime(g.ai_summary_updated_at) : 'never'}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500 italic">
              No summary yet — click "Regen AI summary" above to generate one.
            </p>
          )}
        </section>
      </div>

      {/* Stats summary chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Chip icon={Calendar} label="Bookings" value={timeline.bookings_count} />
        <Chip icon={MessageCircle} label="Messages" value={timeline.messages_count} />
        <Chip icon={Star} label="Reviews" value={timeline.reviews_count} />
        <Chip icon={StickyNote} label="Notes" value={timeline.notes_count} />
      </div>

      {/* Bookings timeline */}
      <section className="ix-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Calendar size={14} className="text-rose-600" />
            Bookings ({bookings.length})
          </h2>
          <span className="text-[11px] text-slate-400">
            Cache refreshed {fmtCairoDateTime(timeline.refreshed_at)}
          </span>
        </div>
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No bookings tracked.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {bookings.slice(0, 50).map((e, i) => {
              const meta = e.meta as {
                status?: string;
                source?: string;
                check_in?: string;
                check_out?: string;
                host_payout?: number;
                currency?: string;
                reservation_id?: string;
              };
              return (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--bh-navy)' }}>
                      {e.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {meta?.source || '—'} · {meta?.status || '—'} ·{' '}
                      {meta?.check_in || '—'} → {meta?.check_out || '—'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {meta?.host_payout != null ? `${fmtMoney(meta.host_payout)} ${meta.currency || ''}` : '—'}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Communications timeline (read-only stub — Phase C lights up the composer) */}
      <section className="ix-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageCircle size={14} className="text-cyan-600" />
            Communications ({messages.length})
          </h2>
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Read-only · Phase C adds composer
          </span>
        </div>
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No messages mirrored yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {messages.slice(0, 30).map((e, i) => {
              const meta = e.meta as { sent_by?: string; module_type?: string; body?: string; conversation_id?: string };
              return (
                <li key={i} className="py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      {fmtCairoDateTime(e.at)} · <code>{meta?.module_type || '?'}</code> ·{' '}
                      <code>{meta?.sent_by || '?'}</code>
                    </span>
                  </div>
                  {meta?.body && (
                    <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 line-clamp-3">
                      {meta.body}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Reviews placeholder */}
      <section className="ix-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Star size={14} className="text-amber-600" />
          Reviews ({reviews.length})
        </h2>
        <p className="text-sm text-slate-500 italic">
          Review-to-guest matching is sparse without reservation_id links — rich review timeline ships with Phase I (AI multi-language reply generator).
        </p>
      </section>

      {/* Internal notes */}
      <section className="ix-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <StickyNote size={14} className="text-slate-600" />
          Internal notes ({notes.length})
        </h2>

        <form action={addNoteAction} className="space-y-2">
          <input type="hidden" name="guest_id" value={g.id} />
          <textarea
            name="body"
            required
            rows={2}
            placeholder="Add a note (visible to all Beit Hady CRM users)…"
            className="ix-input w-full"
          />
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" name="pinned" /> <Pin size={12} /> Pin to top
            </label>
            <button type="submit" className="ix-btn-primary text-xs ml-auto">
              Add note
            </button>
          </div>
        </form>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {notes.map(n => (
            <li key={n.id} className="py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {n.pinned && <Pin size={10} className="text-amber-600" />}
                  <span className="font-medium">{n.author_username || 'system'}</span>
                  <span>·</span>
                  <span>{fmtCairoDateTime(n.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
              </div>
              <form action={deleteNoteAction}>
                <input type="hidden" name="note_id" value={n.id} />
                <input type="hidden" name="guest_id" value={g.id} />
                <button
                  type="submit"
                  title="Delete note"
                  className="text-slate-400 hover:text-rose-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </form>
            </li>
          ))}
          {notes.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500 italic">
              No notes yet. Add one above.
            </li>
          )}
        </ul>
      </section>

      <section className="ix-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          Tasks
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Phase F
          </span>
        </h2>
        <p className="text-sm text-slate-500 italic">
          Pre-arrival reminders, mid-stay outreach, post-stay review asks, manual to-dos — all light up in Phase F.
        </p>
      </section>

      <p className="text-[10px] text-slate-400 text-center">
        Profile cached at {fmtCairoDateTime(timeline.refreshed_at)}.{' '}
        <a
          href={g.guesty_guest_id ? `https://app.guesty.com/guests/${g.guesty_guest_id}` : '#'}
          target="_blank"
          rel="noreferrer"
          className="ix-link inline-flex items-center gap-1"
        >
          Open in Guesty <ExternalLink size={10} />
        </a>
      </p>
    </BeithadyShell>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-slate-400 shrink-0" />
      <span className="text-xs text-slate-500 w-20">{label}</span>
      <span className={`flex-1 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: number }) {
  return (
    <div className="ix-card p-3 flex items-center gap-3">
      <Icon size={18} className="text-slate-400" />
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
        <div className="text-lg font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
          {value}
        </div>
      </div>
    </div>
  );
}
