import Link from 'next/link';
import {
  Users,
  RefreshCw,
  Search,
  ChevronRight,
  Layers,
  Crown,
  Plane,
  ListChecks,
  Globe2,
  ChevronLeft,
  Download,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listGuests, getDashboardStats, flagFor, type GuestListFilter, type GuestListSort } from '@/lib/beithady/crm/guest-list';
import { tierConfig, LOYALTY_TIERS, type LoyaltyTier } from '@/lib/beithady/crm/loyalty';
import { fmtCairoDate } from '@/lib/fmt-date';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { runCrmSyncAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type SearchParams = {
  q?: string;
  country?: string;
  tier?: string | string[];
  vip?: string;
  future?: string;
  minStays?: string;
  hasConv?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.length > 0) return [v];
  return [];
}

function parseFilter(sp: SearchParams): GuestListFilter {
  const f: GuestListFilter = {};
  if (sp.q) f.search = sp.q;
  if (sp.country) f.countries = sp.country.split(',').filter(Boolean);
  const tiers = asArray(sp.tier).filter(t =>
    (LOYALTY_TIERS.map(x => x.tier) as string[]).includes(t)
  ) as LoyaltyTier[];
  if (tiers.length) f.tiers = tiers;
  if (sp.vip === '1') f.vipOnly = true;
  if (sp.future === '1') f.hasFutureBooking = true;
  if (sp.hasConv === '1') f.hasConversation = true;
  const ms = parseInt(sp.minStays || '', 10);
  if (Number.isFinite(ms) && ms > 0) f.minStays = ms;
  return f;
}

function parseSort(s: string | undefined): GuestListSort {
  switch (s) {
    case 'next_arrival_asc':
    case 'lifetime_stays_desc':
    case 'lifetime_spend_desc':
    case 'name_asc':
    case 'last_seen_desc':
      return s;
    default:
      return 'last_seen_desc';
  }
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n);
}

export default async function BeithadyCrmPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireBeithadyPermission('crm', 'read');
  const sp = await searchParams;

  const filter = parseFilter(sp);
  const sort = parseSort(sp.sort);
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(10, parseInt(sp.pageSize || '50', 10) || 50));

  const [stats, list] = await Promise.all([
    getDashboardStats(),
    listGuests({ filter, sort, page, pageSize }),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.total / pageSize));

  return (
    <BeithadyShell breadcrumbs={[{ label: 'CRM' }]}>
      <BeithadyHeader
        eyebrow="Beit Hady · CRM"
        title="Guests"
        subtitle="Hospitality 360° — every Guesty guest mirrored, deduped by guesty_guest_id, email and phone."
        right={
          <form action={runCrmSyncAction}>
            <button type="submit" className="ix-btn-secondary">
              <RefreshCw size={14} />
              Run sync now
            </button>
          </form>
        }
      />

      {/* Smart widgets */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Total guests" value={fmtMoney(stats.total_guests)} icon={Users} accent="slate" />
        <Stat label="Returning (≥2 stays)" value={fmtMoney(stats.returning_guests)} icon={Layers} accent="emerald" />
        <Stat label="VIP" value={fmtMoney(stats.vip_count)} icon={Crown} accent="gold" />
        <Stat label="Arrivals next 30d" value={fmtMoney(stats.next_30d_arrivals)} icon={Plane} accent="cyan" />
        <Stat label="Top country" value={stats.top_countries[0] ? `${flagFor(stats.top_countries[0].country)} ${stats.top_countries[0].count}` : '—'} icon={Globe2} accent="violet" />
      </section>

      {/* Filter bar */}
      <form className="ix-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <label className="space-y-1 lg:col-span-2">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Search</span>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={sp.q || ''}
              placeholder="Name, email, phone…"
              className="ix-input w-full pl-9"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Country (ISO)</span>
          <input
            name="country"
            defaultValue={sp.country || ''}
            placeholder="EG,SA,US…"
            className="ix-input w-full"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Tier</span>
          <select name="tier" defaultValue={typeof sp.tier === 'string' ? sp.tier : ''} className="ix-input w-full">
            <option value="">Any</option>
            {LOYALTY_TIERS.filter(t => t.tier !== 'none').map(t => (
              <option key={t.tier} value={t.tier}>
                {t.emoji} {t.label} (≥{t.min_stays})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Sort</span>
          <select name="sort" defaultValue={sort} className="ix-input w-full">
            <option value="last_seen_desc">Recent activity</option>
            <option value="next_arrival_asc">Soonest arrival</option>
            <option value="lifetime_stays_desc">Most stays</option>
            <option value="lifetime_spend_desc">Highest spend</option>
            <option value="name_asc">Name A→Z</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">Min stays</span>
          <input
            name="minStays"
            type="number"
            min={0}
            defaultValue={sp.minStays || ''}
            className="ix-input w-full"
          />
        </label>
        <div className="flex flex-wrap gap-3 items-center text-sm lg:col-span-2">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="vip" value="1" defaultChecked={sp.vip === '1'} />
            <Crown size={12} className="text-yellow-600" /> VIP only
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="future" value="1" defaultChecked={sp.future === '1'} />
            <Plane size={12} className="text-cyan-600" /> Future booking
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" name="hasConv" value="1" defaultChecked={sp.hasConv === '1'} />
            Has conversation
          </label>
        </div>
        <div className="flex gap-2 lg:col-span-4">
          <button type="submit" className="ix-btn-primary">
            <Search size={14} /> Filter
          </button>
          <Link href="/emails/beithady/crm" className="ix-btn-secondary">
            Clear
          </Link>
          <Link href="/emails/beithady/crm/segments" className="ix-btn-secondary">
            <ListChecks size={14} /> Segments
          </Link>
          <Link href="/emails/beithady/crm/loyalty" className="ix-btn-secondary">
            🥇 Loyalty
          </Link>
        </div>
      </form>

      {/* Bulk-export bar (acts on the current filter set across all pages).
          Per-row checkbox bulk-tag is Phase B+; for now tags are managed
          on the per-guest profile page. */}
      <div className="ix-card p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">Filter results:</span>
        <a
          href={`/api/beithady/crm/export-csv?${new URLSearchParams(
            Object.entries(sp)
              .filter(([k, v]) => k !== 'page' && k !== 'pageSize' && typeof v === 'string' && v.length > 0)
              .map(([k, v]) => [k, v as string])
          ).toString()}`}
          className="ix-btn-secondary text-xs"
        >
          <Download size={12} /> Download CSV ({list.total} {list.total === 1 ? 'guest' : 'guests'})
        </a>
        <span className="text-xs text-slate-400 ml-auto">
          Per-row selection + bulk-tag → Phase B+ (manage tags on guest profile for now)
        </span>
      </div>

      {/* Guest table */}
      <div className="ix-card overflow-hidden">
        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
          {fmtMoney(list.total)} guest{list.total === 1 ? '' : 's'} match{' '}
          · page {page} of {totalPages}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/40">
              <th className="py-2 px-3">Guest</th>
              <th className="py-2 px-3">Country</th>
              <th className="py-2 px-3 text-right">Stays</th>
              <th className="py-2 px-3 text-right">Nights</th>
              <th className="py-2 px-3 text-right">Spend USD</th>
              <th className="py-2 px-3">Tier</th>
              <th className="py-2 px-3">Last seen</th>
              <th className="py-2 px-3">Next arrival</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map(g => {
              const tier = tierConfig(g.loyalty_tier);
              return (
                <tr
                  key={g.id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-stone-50/50 dark:hover:bg-slate-800/30"
                >
                  <td className="py-2 px-3">
                    <Link
                      href={`/emails/beithady/crm/${g.id}`}
                      className="font-medium hover:underline"
                      style={{ color: 'var(--bh-navy)' }}
                    >
                      {g.full_name || '(unnamed)'}
                    </Link>
                    <div className="text-xs text-slate-500 truncate max-w-[280px]">
                      {g.email || g.phone_e164 || '—'}
                    </div>
                    {g.vip && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 mt-1">
                        <Crown size={10} /> VIP
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <span className="text-base">{flagFor(g.residence_country)}</span>
                      <span className="text-xs text-slate-500">{g.residence_country || '—'}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{g.lifetime_stays}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{g.lifetime_nights}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtMoney(g.lifetime_spend_usd)}</td>
                  <td className="py-2 px-3">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: tier.display_color + '22', color: tier.display_color }}
                    >
                      {tier.emoji} {tier.label}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    {g.last_seen ? fmtCairoDate(g.last_seen) : '—'}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {g.next_arrival_at ? (
                      <span className="text-cyan-700 dark:text-cyan-300 font-medium">
                        {fmtCairoDate(g.next_arrival_at)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <Link href={`/emails/beithady/crm/${g.id}`} className="ix-link text-xs inline-flex items-center gap-1">
                      Open
                      <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {list.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-slate-500">
                  <Users size={20} className="mx-auto mb-2 text-slate-300" />
                  No guests match the current filter.
                  {list.total === 0 && stats.total_guests === 0 && (
                    <div className="mt-2">
                      Run the CRM sync to populate the guest mirror.
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} sp={sp} />
        )}
      </div>
    </BeithadyShell>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; accent: 'slate' | 'emerald' | 'gold' | 'cyan' | 'violet' }) {
  const tints: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    gold: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  };
  return (
    <div className="ix-card p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg inline-flex items-center justify-center ${tints[accent]}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
        <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, sp }: { page: number; totalPages: number; sp: SearchParams }) {
  const buildHref = (p: number): string => {
    const params = new URLSearchParams();
    Object.entries(sp).forEach(([k, v]) => {
      if (k === 'page') return;
      if (Array.isArray(v)) v.forEach(x => params.append(k, x));
      else if (typeof v === 'string' && v.length > 0) params.set(k, v);
    });
    params.set('page', String(p));
    return `?${params.toString()}`;
  };
  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
      <Link
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`ix-btn-secondary text-xs ${page <= 1 ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <ChevronLeft size={14} /> Prev
      </Link>
      <span className="text-xs text-slate-500">
        Page {page} of {totalPages}
      </span>
      <Link
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`ix-btn-secondary text-xs ${page >= totalPages ? 'opacity-40 pointer-events-none' : ''}`}
      >
        Next <ChevronRight size={14} />
      </Link>
    </div>
  );
}
