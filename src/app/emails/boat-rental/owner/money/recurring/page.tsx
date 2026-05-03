import { Wallet, Pause, Play } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds, hasBoatRole } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { MoneySubNav } from '../_components/sub-nav';
import {
  createRecurringTemplateAction,
  pauseRecurringTemplateAction,
  resumeRecurringTemplateAction,
} from './actions';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  amenities: 'Amenities',
  part_time_skipper: 'Part-time skipper',
  marina_docking: 'Marina docking',
  fuel: 'Fuel',
  repair: 'Repair',
  insurance: 'Insurance',
  boat_license: 'Boat license',
  full_time_skipper_salary: 'Full-time skipper salary',
  maintenance_contract: 'Maintenance contract',
  other: 'Other',
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

type Template = {
  id: string;
  boat_id: string;
  category: string;
  vendor_name: string | null;
  amount_egp: string | number;
  frequency: string;
  day_of_period: number;
  month_of_year: number | null;
  description: string | null;
  active: boolean;
  next_run_date: string;
  last_run_date: string | null;
  boat: { name: string } | null;
};

export default async function OwnerRecurringPage() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const isAdmin = me ? await hasBoatRole(me, 'admin') : false;
  const sb = supabaseAdmin();

  const boatsRes = isAdmin
    ? await sb.from('boat_rental_boats').select('id, name').order('name')
    : ownerIds.length
      ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
      : { data: [] as Array<{ id: string; name: string }> };
  const boats =
    ((boatsRes.data as unknown) as Array<{ id: string; name: string }> | null) ?? [];

  const templatesRes = isAdmin
    ? await sb
        .from('boat_rental_recurring_expense_templates')
        .select(
          `
          id, boat_id, category, vendor_name, amount_egp, frequency,
          day_of_period, month_of_year, description, active, next_run_date, last_run_date,
          boat:boat_rental_boats ( name )
        `
        )
        .order('active', { ascending: false })
    : ownerIds.length
    ? await sb
        .from('boat_rental_recurring_expense_templates')
        .select(
          `
          id, boat_id, category, vendor_name, amount_egp, frequency,
          day_of_period, month_of_year, description, active, next_run_date, last_run_date,
          boat:boat_rental_boats ( name )
        `
        )
        .in('owner_id', ownerIds)
        .order('active', { ascending: false })
        .order('next_run_date', { ascending: true })
    : { data: [] as Template[] };
  const templates = ((templatesRes.data as unknown) as Template[] | null) ?? [];

  const active = templates.filter((t) => t.active);
  const paused = templates.filter((t) => !t.active);

  return (
    <>
      <header className="flex items-start gap-4 mb-2">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300">
          <Wallet size={24} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
            Owner Portal
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Money</h1>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/money" />
      <MoneySubNav current="/emails/boat-rental/owner/money/recurring" />

      <section className="ix-card p-5 mb-6">
        <h2 className="font-semibold mb-3">Add a recurring template</h2>
        <p className="text-xs text-slate-500 mb-4">
          Generates an open bill on the schedule below — useful for recurring marina fees,
          insurance premiums, full-time skipper salary, and licenses.
        </p>
        {boats.length === 0 ? (
          <p className="text-sm text-slate-500">Add a boat first.</p>
        ) : (
          <form
            action={createRecurringTemplateAction}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Boat *</span>
              <select name="boat_id" required className="ix-input mt-1">
                {boats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Category *</span>
              <select name="category" required defaultValue="marina_docking" className="ix-input mt-1">
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Vendor</span>
              <input name="vendor_name" placeholder="optional" className="ix-input mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Amount (EGP) *</span>
              <input
                name="amount_egp"
                type="number"
                min="1"
                step="0.01"
                required
                className="ix-input mt-1"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Frequency *</span>
              <select name="frequency" required defaultValue="monthly" className="ix-input mt-1">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-slate-600 text-xs">Day of period (1-28) *</span>
              <input
                name="day_of_period"
                type="number"
                min="1"
                max="28"
                required
                defaultValue="1"
                className="ix-input mt-1"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-slate-600 text-xs">Month of year (yearly only, 1-12)</span>
              <input
                name="month_of_year"
                type="number"
                min="1"
                max="12"
                placeholder="e.g. 1 for January"
                className="ix-input mt-1"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-slate-600 text-xs">Description / notes</span>
              <input name="description" className="ix-input mt-1" />
            </label>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="ix-btn-primary">
                Add template
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-semibold mb-3">Active templates ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500 ix-card p-5">No active templates.</p>
        ) : (
          <div className="space-y-2">
            {active.map((t) => (
              <TemplateRow key={t.id} t={t} mode="active" />
            ))}
          </div>
        )}
      </section>

      {paused.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Paused templates ({paused.length})</h2>
          <div className="space-y-2">
            {paused.map((t) => (
              <TemplateRow key={t.id} t={t} mode="paused" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TemplateRow({ t, mode }: { t: Template; mode: 'active' | 'paused' }) {
  return (
    <div
      className={`ix-card p-4 flex items-start justify-between gap-3 flex-wrap ${
        mode === 'paused' ? 'opacity-70' : ''
      }`}
    >
      <div>
        <div className="font-semibold text-sm">
          {CATEGORY_LABELS[t.category] ?? t.category}
          {t.vendor_name ? ` · ${t.vendor_name}` : ''}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {t.boat?.name ?? '—'} · EGP {Number(t.amount_egp).toLocaleString()} ·{' '}
          {FREQUENCY_LABELS[t.frequency] ?? t.frequency} · day {t.day_of_period}
          {t.month_of_year ? ` of month ${t.month_of_year}` : ''}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Next run: <span className="font-medium">{t.next_run_date}</span>
          {t.last_run_date && (
            <span> · Last: {t.last_run_date}</span>
          )}
        </div>
        {t.description && (
          <p className="text-xs text-slate-500 mt-1 max-w-md">{t.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {mode === 'active' ? (
          <form action={pauseRecurringTemplateAction}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
            >
              <Pause size={13} /> Pause
            </button>
          </form>
        ) : (
          <form action={resumeRecurringTemplateAction}>
            <input type="hidden" name="id" value={t.id} />
            <button
              type="submit"
              className="text-xs inline-flex items-center gap-1 text-cyan-700 hover:text-cyan-900"
            >
              <Play size={13} /> Resume
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
