import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listAllTemplates } from '@/lib/beithady/communication/templates';
import { CATEGORY_LABELS } from '@/lib/beithady/communication/templates-shared';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { TemplateRow } from './_components/template-row';
import { TemplateFormDialog } from './_components/template-form-dialog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Phase Q.2.5 — admin templates CRUD page. Lists all templates with
// active toggle, edit, delete inline. New-template button opens the
// same form dialog as Edit. Permission gate: communication:full.

export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  await requireBeithadyPermission('communication', 'full');
  const sp = await searchParams;
  const templates = await listAllTemplates();

  const editing = sp.edit ? templates.find(t => t.id === sp.edit) || null : null;
  const showDialog = !!editing || sp.new === '1';

  return (
    <BeithadyShell breadcrumbs={[
      { label: 'Communication', href: '/beithady/communication' },
      { label: 'Admin' },
      { label: 'Templates' },
    ]} containerClass="max-w-6xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Communication · Admin"
        title="Message Templates"
        subtitle="Canned replies for the unified inbox composer. Variables like {guest_first_name} resolve client-side at insert-time."
        right={
          <Link href="/beithady/communication/admin/templates?new=1" className="ix-btn-primary text-xs">
            <Plus size={12} /> New template
          </Link>
        }
      />

      <section className="ix-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 dark:bg-slate-800/40 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Lang</th>
              <th className="px-3 py-2 text-left">Channels</th>
              <th className="px-3 py-2 text-left">Sort</th>
              <th className="px-3 py-2 text-center">Active</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  <FileText size={16} className="mx-auto text-slate-300 mb-2" />
                  No templates yet.
                </td>
              </tr>
            ) : (
              templates.map(t => (
                <TemplateRow key={t.id} template={t} categoryLabel={CATEGORY_LABELS[t.category]} />
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-slate-500 text-center pt-2">
        Variable resolution happens client-side at template-pick time. Templates with unresolved variables
        block the send button until the variable is filled in.
      </p>

      {showDialog && <TemplateFormDialog initial={editing} />}
    </BeithadyShell>
  );
}
