import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText, ListChecks, HelpCircle, CheckCircle2, Download } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getCurrentUser } from '@/lib/auth';
import { getArticle, findCounterpart, ROLE_LABEL_EN, ROLE_LABEL_AR, SUBCATEGORY_LABEL } from '@/lib/beithady/sop/queries';
import { renderMarkdown } from '@/lib/beithady/sop/md';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { AcknowledgeButton } from './_acknowledge';

export const dynamic = 'force-dynamic';

const KIND_ICON = { sop: FileText, checklist: ListChecks, kb: HelpCircle };
const KIND_LABEL = { sop: 'Standard Operating Procedure', checklist: 'Checklist', kb: 'Knowledge Article' };

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireBeithadyPermission('operations', 'read');
  const { slug } = await params;
  const user = await getCurrentUser();
  const [article, counterpart] = await Promise.all([
    getArticle(slug, user?.id),
    findCounterpart(slug),
  ]);
  if (!article) notFound();

  const Icon = KIND_ICON[article.kind];
  const isRtl = article.language === 'ar';
  const roleLabel = isRtl ? ROLE_LABEL_AR[article.role] : ROLE_LABEL_EN[article.role];

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Operations', href: '/beithady/operations' },
      { label: 'SOP & KB', href: '/beithady/operations/sop' },
      { label: article.title },
    ]} containerClass="max-w-3xl">
      <div>
        <Link
          href="/beithady/operations/sop"
          className="text-xs text-slate-500 hover:text-[var(--bh-navy)] inline-flex items-center gap-0.5"
        >
          <ChevronLeft size={12} /> Back to library
        </Link>
      </div>

      <BeithadyHeader
        eyebrow={
          <span className="inline-flex items-center gap-1">
            <Icon size={11} /> {KIND_LABEL[article.kind]} · {roleLabel}
            {article.subcategory && (
              <> · {SUBCATEGORY_LABEL[article.subcategory].en}</>
            )}
          </span>
        }
        title={article.title}
        subtitle={article.summary || undefined}
        right={
          <div className="flex items-center gap-2">
            <a
              href={`/api/beithady/sop/article/${article.slug}/pdf`}
              className="ix-btn-secondary !text-xs"
              title="Download A4 PDF"
            >
              <Download size={11} /> PDF
            </a>
            {counterpart && (
              <Link
                href={`/beithady/operations/sop/${counterpart.slug}`}
                className="ix-btn-secondary !text-xs"
                title={counterpart.language === 'ar' ? 'القراءة بالعربية' : 'Read in English'}
              >
                {counterpart.language === 'ar' ? '🇪🇬 العربية' : '🇬🇧 English'}
              </Link>
            )}
          </div>
        }
      />

      {/* Meta strip */}
      <section className="ix-card p-3 flex flex-wrap items-center gap-3 text-[11px]">
        <span className="text-slate-500">v{article.version}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-500">
          Updated {new Date(article.updated_at).toLocaleDateString()}
        </span>
        {article.tags.length > 0 && (
          <>
            <span className="text-slate-500">·</span>
            <div className="inline-flex items-center gap-1 flex-wrap">
              {article.tags.map(t => (
                <span key={t} className="px-1.5 py-px bg-slate-100 dark:bg-slate-800 rounded">
                  {t}
                </span>
              ))}
            </div>
          </>
        )}
        <div className="ml-auto inline-flex items-center gap-2">
          <span className="text-slate-500">
            {article.ack_count} acknowledged
          </span>
          {article.acknowledged_by_me ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
              <CheckCircle2 size={12} /> Read
            </span>
          ) : (
            <AcknowledgeButton articleId={article.id} version={article.version} />
          )}
        </div>
      </section>

      {/* Body */}
      <article
        className="ix-card p-5 prose prose-sm dark:prose-invert max-w-none"
        dir={isRtl ? 'rtl' : 'ltr'}
        lang={isRtl ? 'ar' : 'en'}
        style={isRtl ? { fontFamily: "'Segoe UI','Tahoma','Cairo','Amiri','Geeza Pro',sans-serif" } : undefined}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body_md) }}
      />

      {/* Checklist items (when kind=checklist and items exist) */}
      {article.kind === 'checklist' && article.checklist_items && article.checklist_items.length > 0 && (
        <section className="ix-card p-4">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--bh-navy)' }}>
            Checklist items
          </h3>
          <ul className="space-y-1.5 text-xs">
            {article.checklist_items.map((it, i) => (
              <li key={it.id || i} className="flex items-start gap-2">
                <span className="inline-block w-4 h-4 mt-0.5 rounded border border-slate-300 dark:border-slate-600 shrink-0" />
                <span>{it.text}</span>
                {it.photo_required && (
                  <span className="text-[9px] px-1 py-px bg-amber-100 text-amber-700 dark:bg-amber-900/30 rounded ml-auto">
                    photo required
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </BeithadyShell>
  );
}
