import Link from 'next/link';
import { BookOpen, Search, FileText, ListChecks, HelpCircle, ChevronRight, Download } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listArticles, listAllRoleCounts, ROLE_LABEL_EN, SUBCATEGORY_LABEL, type SopRole, type SopSubcategory, type SopKind } from '@/lib/beithady/sop/queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';

export const dynamic = 'force-dynamic';

const ROLES: SopRole[] = ['all', 'reception', 'guest_relations', 'housekeeping', 'maintenance', 'upselling'];
const KIND_ICON: Record<SopKind, React.ComponentType<{ size?: number; className?: string }>> = {
  sop: FileText,
  checklist: ListChecks,
  kb: HelpCircle,
};
const KIND_LABEL: Record<SopKind, string> = {
  sop: 'SOP',
  checklist: 'Checklist',
  kb: 'KB',
};

function isValidRole(v: string | undefined): v is SopRole {
  return ROLES.includes(v as SopRole);
}
function isValidSubcat(v: string | undefined): v is SopSubcategory {
  return v === 'transportation' || v === 'excursions' || v === 'f_b' || v === 'affiliations';
}

export default async function SopLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; sub?: string; kind?: string; q?: string; lang?: string }>;
}) {
  await requireBeithadyPermission('operations', 'read');
  const sp = await searchParams;
  const role: SopRole | undefined = isValidRole(sp.role) ? sp.role : undefined;
  const sub: SopSubcategory | undefined = isValidSubcat(sp.sub) ? sp.sub : undefined;
  const kind = sp.kind === 'sop' || sp.kind === 'checklist' || sp.kind === 'kb' ? sp.kind : undefined;
  const language: 'en' | 'ar' | undefined = sp.lang === 'en' || sp.lang === 'ar' ? sp.lang : undefined;
  const search = sp.q;

  const [articles, roleCounts] = await Promise.all([
    listArticles({ role, subcategory: sub, kind, language, search }),
    listAllRoleCounts(),
  ]);

  const buildHref = (next: { lang?: 'en' | 'ar' | null }) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (sub) params.set('sub', sub);
    if (kind) params.set('kind', kind);
    if (search) params.set('q', search);
    if (next.lang === 'en' || next.lang === 'ar') params.set('lang', next.lang);
    return `?${params.toString()}`;
  };

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/emails/beithady/operations' },
      { label: 'SOP & Knowledge Base' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Operations"
        title="SOP & Knowledge Base"
        subtitle={`${articles.length} article${articles.length === 1 ? '' : 's'} across Reception, Guest Relations, Housekeeping, Maintenance, and Upselling.`}
        right={role ? (
          <a
            href={`/api/beithady/sop/role/${role}/pdf${language ? `?lang=${language}` : ''}`}
            className="ix-btn-primary !text-xs"
            title={`Download ${ROLE_LABEL_EN[role]} bundle as A4 PDF`}
          >
            <Download size={12} /> Download {ROLE_LABEL_EN[role]} bundle
          </a>
        ) : undefined}
      />

      {/* Role tabs */}
      <section className="ix-card p-2 flex flex-wrap gap-1 text-xs">
        <Link
          href="/emails/beithady/operations/sop"
          className={`px-3 py-1.5 rounded-full inline-flex items-center gap-1
            ${!role
              ? 'bg-[var(--bh-navy)] text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          <BookOpen size={12} /> All ({Object.values(roleCounts).reduce((s, n) => s + n, 0)})
        </Link>
        {ROLES.filter(r => r !== 'all').map(r => (
          <Link
            key={r}
            href={`?role=${r}`}
            className={`px-3 py-1.5 rounded-full
              ${role === r
                ? 'bg-[var(--bh-navy)] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            {ROLE_LABEL_EN[r]} ({roleCounts[r] || 0})
          </Link>
        ))}
      </section>

      {/* Upselling subcategories — only when role=upselling */}
      {role === 'upselling' && (
        <section className="ix-card p-2 flex flex-wrap gap-1 text-xs">
          <Link
            href="?role=upselling"
            className={`px-3 py-1 rounded-full ${!sub
              ? 'bg-cyan-600 text-white'
              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
          >
            All upselling
          </Link>
          {(['transportation', 'excursions', 'f_b', 'affiliations'] as SopSubcategory[]).map(s => {
            const m = SUBCATEGORY_LABEL[s];
            return (
              <Link
                key={s}
                href={`?role=upselling&sub=${s}`}
                className={`px-3 py-1 rounded-full inline-flex items-center gap-1 ${sub === s
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}
              >
                <span>{m.emoji}</span> {m.en}
              </Link>
            );
          })}
        </section>
      )}

      {/* Language + Kind chips + search */}
      <section className="ix-card p-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Lang:</span>
        <Link
          href={buildHref({ lang: null })}
          className={`px-2.5 py-1 rounded-full ${!language
            ? 'bg-emerald-600 text-white'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
        >
          All
        </Link>
        <Link
          href={buildHref({ lang: 'en' })}
          className={`px-2.5 py-1 rounded-full ${language === 'en'
            ? 'bg-emerald-600 text-white'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
        >
          EN
        </Link>
        <Link
          href={buildHref({ lang: 'ar' })}
          className={`px-2.5 py-1 rounded-full ${language === 'ar'
            ? 'bg-emerald-600 text-white'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
        >
          AR · العربية
        </Link>
        <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Type:</span>
        <Link
          href={role ? `?role=${role}${sub ? `&sub=${sub}` : ''}${search ? `&q=${search}` : ''}` : '/emails/beithady/operations/sop'}
          className={`px-2.5 py-1 rounded-full ${!kind
            ? 'bg-amber-500 text-white'
            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
        >
          All
        </Link>
        {(['sop', 'checklist', 'kb'] as SopKind[]).map(k => {
          const Icon = KIND_ICON[k];
          const params = new URLSearchParams();
          if (role) params.set('role', role);
          if (sub) params.set('sub', sub);
          params.set('kind', k);
          if (search) params.set('q', search);
          return (
            <Link
              key={k}
              href={`?${params.toString()}`}
              className={`px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${kind === k
                ? 'bg-amber-500 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'}`}
            >
              <Icon size={11} /> {KIND_LABEL[k]}
            </Link>
          );
        })}
        <form action="/emails/beithady/operations/sop" className="ml-auto flex items-center gap-1">
          {role && <input type="hidden" name="role" value={role} />}
          {sub && <input type="hidden" name="sub" value={sub} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          <Search size={12} className="text-slate-400" />
          <input
            type="search"
            name="q"
            placeholder="Search title / summary / tag…"
            defaultValue={search || ''}
            className="ix-input !text-xs !py-1 !px-2 w-56"
          />
        </form>
      </section>

      {/* Article list */}
      {articles.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500">
          <BookOpen size={28} className="mx-auto mb-2 text-slate-300" />
          No articles match your filters.
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {articles.map(a => {
            const Icon = KIND_ICON[a.kind];
            return (
              <Link
                key={a.id}
                href={`/emails/beithady/operations/sop/${a.slug}`}
                className="ix-card p-3 group hover:shadow-md hover:-translate-y-0.5 transition flex flex-col"
                dir={a.language === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                  <Icon size={11} />
                  <span className="uppercase tracking-wide">{KIND_LABEL[a.kind]}</span>
                  <span>·</span>
                  <span>{ROLE_LABEL_EN[a.role]}</span>
                  {a.subcategory && (
                    <>
                      <span>·</span>
                      <span>{SUBCATEGORY_LABEL[a.subcategory].en}</span>
                    </>
                  )}
                  {a.language === 'ar' && (
                    <span className="ml-auto px-1 py-px bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 rounded text-[9px]">AR</span>
                  )}
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--bh-navy)' }}>
                  {a.title}
                </h3>
                {a.summary && (
                  <p className="text-[11px] text-slate-500 line-clamp-2 mb-2">{a.summary}</p>
                )}
                <div className="mt-auto flex items-center gap-1 flex-wrap">
                  {a.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-px bg-slate-100 dark:bg-slate-800 rounded">
                      {t}
                    </span>
                  ))}
                  <ChevronRight size={11} className="ml-auto text-slate-400 group-hover:text-[var(--bh-navy)] transition" />
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </BeithadyShell>
  );
}
