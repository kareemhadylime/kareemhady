'use client';
import Link from 'next/link';
import { X } from 'lucide-react';
import { createTemplateAction, updateTemplateAction } from '../actions';
import { CATEGORY_ORDER, CATEGORY_LABELS, type Template } from '@/lib/beithady/communication/templates-shared';

const KNOWN_VARS = [
  '{guest_name}', '{guest_first_name}', '{listing_nickname}',
  '{check_in_date}', '{check_out_date}', '{nights}', '{guests}', '{building_code}',
  '{wifi_ssid}', '{wifi_password}', '{checkin_time}', '{agent_name}', '{today_date}', '{address}',
];

export function TemplateFormDialog({ initial }: { initial: Template | null }) {
  const isNew = !initial;
  const action = isNew ? createTemplateAction : updateTemplateAction;
  const closeHref = '/beithady/communication/admin/templates';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
          <h2 className="font-semibold">{isNew ? 'New template' : `Edit · ${initial!.name}`}</h2>
          <Link href={closeHref} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </Link>
        </div>

        <form action={action} className="p-4 space-y-3 text-sm">
          {!isNew && <input type="hidden" name="id" value={initial!.id} />}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
            <input
              type="text"
              name="name"
              defaultValue={initial?.name || ''}
              className="ix-input w-full text-sm"
              required
              autoFocus={isNew}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Category</label>
              <select name="category" defaultValue={initial?.category || 'general'} className="ix-input w-full text-sm">
                {CATEGORY_ORDER.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Language</label>
              <select name="language" defaultValue={initial?.language || 'en'} className="ix-input w-full text-sm">
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Sort order</label>
              <input
                type="number"
                name="sort_order"
                defaultValue={initial?.sort_order ?? 100}
                className="ix-input w-full text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Channels (empty = any)</label>
            <div className="flex flex-wrap gap-3 text-xs">
              {(['guesty', 'wa_cloud', 'wa_casual'] as const).map(c => (
                <label key={c} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name={`channel_${c}`}
                    defaultChecked={initial ? initial.channel.includes(c) : false}
                  />
                  {c === 'guesty' ? 'Guesty' : c === 'wa_cloud' ? 'WA Cloud' : 'WA Casual'}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Source filter (comma-separated; empty = any source)
            </label>
            <input
              type="text"
              name="source_filter"
              defaultValue={initial?.source_filter.join(', ') || ''}
              className="ix-input w-full text-sm"
              placeholder="airbnb, booking"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Body</label>
            <textarea
              name="body"
              defaultValue={initial?.body || ''}
              className="ix-input w-full text-sm font-mono"
              rows={8}
              required
            />
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
              <span className="font-semibold">Known vars:</span>
              {KNOWN_VARS.map(v => (
                <code key={v} className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{v}</code>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={initial ? initial.active : true}
            />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Link href={closeHref} className="ix-btn-secondary text-xs">Cancel</Link>
            <button type="submit" className="ix-btn-primary text-xs">
              {isNew ? 'Create template' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
