import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ChevronRight,
  Plug,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Download,
  PlugZap,
  Save,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SetupTabs } from '@/app/admin/_components/setup-tabs';
import { getCurrentUser } from '@/lib/auth';
import {
  CREDENTIAL_SPECS,
  getProviderStatus,
  type ProviderId,
} from '@/lib/credentials';
import {
  saveCredentialsAction,
  seedFromEnvAction,
  testCredentialAction,
} from './actions';
import { fmtCairoDateTime } from '@/lib/fmt-date';

export const dynamic = 'force-dynamic';

export default async function IntegrationsAdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin/integrations');
  if (!me.is_admin) notFound();

  const providers = Object.keys(CREDENTIAL_SPECS) as ProviderId[];
  const statuses = await Promise.all(
    providers.map(async p => ({ p, s: await getProviderStatus(p) }))
  );

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin" className="ix-link">Setup</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>API Setup</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Setup · API Credentials
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              Integration Credentials
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Every API the app talks to — Odoo, PriceLabs, Guesty, Shopify,
              Green-API (WhatsApp), Airbnb. Set values here and the app
              reads them dynamically. Env vars are a fallback only.
            </p>
          </div>
          <form action={seedFromEnvAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              title="Copy current env-var values into the DB for any field that isn't already set."
            >
              <Download size={14} /> Seed from env vars
            </button>
          </form>
        </header>

        <SetupTabs activeTab="integrations" />

        <div className="grid grid-cols-1 gap-5">
          {statuses.map(({ p, s }) => (
            <ProviderCard
              key={p}
              providerId={p}
              status={s}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function ProviderCard({
  providerId,
  status,
}: {
  providerId: ProviderId;
  status: Awaited<ReturnType<typeof getProviderStatus>>;
}) {
  const spec = CREDENTIAL_SPECS[providerId];
  const setFields = new Set(status.config_keys_set);
  const envFallbacks = new Set(status.has_env_fallback);

  const isHealthy =
    status.last_test_status === 'ok' &&
    spec.fields.filter(f => f.required).every(f => setFields.has(f.key) || envFallbacks.has(f.key));

  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-lg inline-flex items-center justify-center ${
              status.enabled ? 'bg-lime-50 text-lime-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Plug size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2 flex-wrap">
              {spec.label}
              {status.last_test_status === 'ok' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={10} /> Connected
                </span>
              ) : status.last_test_status === 'error' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  <AlertTriangle size={10} /> Error
                </span>
              ) : isHealthy ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Configured · not tested
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  <AlertTriangle size={10} /> Incomplete
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500">{spec.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
          {spec.helpUrl && (
            <a
              href={spec.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-lime-700"
            >
              Docs <ExternalLink size={10} />
            </a>
          )}
          {status.last_tested_at && (
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              last tested {fmtCairoDateTime(status.last_tested_at)}
            </span>
          )}
        </div>
      </div>

      {/* Result banner — prominent pass/fail surface shown above the form
          so the operator sees last test outcome immediately. */}
      {status.last_test_status && (
        <div
          className={`mx-5 mt-5 rounded-lg p-3 flex items-start gap-3 text-sm ${
            status.last_test_status === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {status.last_test_status === 'ok' ? (
            <CheckCircle2
              size={16}
              className="text-emerald-600 shrink-0 mt-0.5"
            />
          ) : (
            <AlertTriangle
              size={16}
              className="text-rose-600 shrink-0 mt-0.5"
            />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {status.last_test_status === 'ok'
                ? 'Connected'
                : 'Connection failed'}
            </p>
            {status.last_test_error && (
              <p className="text-[11px] mt-0.5 font-mono break-all">
                {status.last_test_error}
              </p>
            )}
          </div>
        </div>
      )}

      <form action={saveCredentialsAction} className="p-5 space-y-4">
        <input type="hidden" name="provider" value={providerId} />

        {spec.fields.map(field => {
          const dbSet = setFields.has(field.key);
          const envSet = envFallbacks.has(field.key);
          const showSource = dbSet ? 'DB' : envSet ? 'ENV' : 'UNSET';
          const sourceColor =
            showSource === 'DB'
              ? 'bg-lime-100 text-lime-700'
              : showSource === 'ENV'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-500';
          return (
            <label key={field.key} className="block space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {field.label}
                  {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                </span>
                <span
                  className={`text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${sourceColor}`}
                >
                  {showSource}
                </span>
              </div>
              <input
                name={`f:${field.key}`}
                type={field.type === 'password' ? 'password' : field.type || 'text'}
                placeholder={
                  dbSet
                    ? '••••••••  (leave blank to keep current)'
                    : field.placeholder || ''
                }
                className="ix-input w-full font-mono text-xs"
                autoComplete="off"
              />
              {field.hint && (
                <p className="text-[10px] text-slate-500">{field.hint}</p>
              )}
              {dbSet && (
                <label className="inline-flex items-center gap-1 text-[10px] text-rose-600">
                  <input type="checkbox" name={`clear:${field.key}`} /> Clear
                  stored value
                </label>
              )}
            </label>
          );
        })}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={status.enabled}
            />
            <span>Enabled</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-600 text-white text-sm font-medium hover:bg-lime-700 shadow-sm"
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </form>

      {/* Separate form for the Test action so it doesn't re-submit the
          credential fields (which would be blank = no-op for existing values). */}
      <form
        action={testCredentialAction}
        className="px-5 pb-5 pt-0 flex items-center justify-end gap-2 border-t border-slate-100 mt-0"
      >
        <input type="hidden" name="provider" value={providerId} />
        <p className="text-[11px] text-slate-500 mr-auto">
          Runs a live API call using the stored credentials. Result is saved
          here and on the card header.
        </p>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:border-lime-500 hover:text-lime-700 transition"
        >
          <PlugZap size={14} /> Test connection
        </button>
      </form>
    </section>
  );
}
