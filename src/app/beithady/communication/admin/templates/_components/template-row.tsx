'use client';
import Link from 'next/link';
import { Edit2, Trash2 } from 'lucide-react';
import { deleteTemplateAction, toggleTemplateActiveAction } from '../actions';
import type { Template } from '@/lib/beithady/communication/templates-shared';

const CHANNEL_LABEL: Record<string, string> = {
  guesty: 'Guesty',
  wa_cloud: 'Cloud',
  wa_casual: 'Casual',
};

export function TemplateRow({
  template,
  categoryLabel,
}: {
  template: Template;
  categoryLabel: string;
}) {
  return (
    <tr className={template.active ? '' : 'opacity-60'}>
      <td className="px-3 py-2">
        <div className="font-medium text-slate-800 dark:text-slate-100">{template.name}</div>
        <div className="text-[11px] text-slate-500 truncate max-w-md">
          {template.body.replace(/\s+/g, ' ').slice(0, 80)}
          {template.body.length > 80 ? '…' : ''}
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{categoryLabel}</td>
      <td className="px-3 py-2 text-xs uppercase font-semibold text-slate-500">{template.language}</td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {template.channel.length === 0
          ? <span className="text-slate-400">any</span>
          : template.channel.map(c => CHANNEL_LABEL[c] || c).join(' · ')}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{template.sort_order}</td>
      <td className="px-3 py-2 text-center">
        <form action={toggleTemplateActiveAction}>
          <input type="hidden" name="id" value={template.id} />
          <input type="hidden" name="next" value={template.active ? 'off' : 'on'} />
          <button
            type="submit"
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase transition ${
              template.active
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200 hover:bg-emerald-200'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {template.active ? 'On' : 'Off'}
          </button>
        </form>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <Link
            href={`/beithady/communication/admin/templates?edit=${template.id}`}
            className="ix-btn-secondary text-xs px-2 py-1"
            title="Edit template"
          >
            <Edit2 size={11} />
          </Link>
          <form action={deleteTemplateAction} onSubmit={(e) => {
            if (!confirm(`Delete template "${template.name}"?`)) e.preventDefault();
          }}>
            <input type="hidden" name="id" value={template.id} />
            <button
              type="submit"
              className="ix-btn-secondary text-xs px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
              title="Delete template"
            >
              <Trash2 size={11} />
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
