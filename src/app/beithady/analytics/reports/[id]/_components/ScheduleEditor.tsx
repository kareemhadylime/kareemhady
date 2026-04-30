'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Mail, MessageCircle } from 'lucide-react';

type Schedule = {
  id: string;
  frequency: string;
  hour_cairo: number;
  day_of_week: number | null;
  day_of_month: number | null;
  email_recipients: string[];
  wa_channel_ids: string[];
  enabled: boolean;
  next_fire_at: string | null;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ScheduleEditor({
  reportId,
  schedules,
  canEdit,
}: {
  reportId: string;
  schedules: Schedule[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [hour, setHour] = useState(9);
  const [dow, setDow] = useState(1); // Mon
  const [dom, setDom] = useState(1);
  const [emails, setEmails] = useState('');
  const [waPhones, setWaPhones] = useState('');

  function add() {
    start(async () => {
      const res = await fetch(`/api/beithady/reports/${reportId}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          frequency: freq,
          hour_cairo: hour,
          day_of_week: freq === 'weekly' ? dow : undefined,
          day_of_month: freq === 'monthly' ? dom : undefined,
          email_recipients: emails
            .split(/[,\s]+/)
            .map(s => s.trim())
            .filter(Boolean),
          wa_channel_ids: waPhones
            .split(/[,\s]+/)
            .map(s => s.trim())
            .filter(Boolean),
          enabled: true,
        }),
      });
      if (res.ok) {
        setAdding(false);
        setEmails('');
        setWaPhones('');
        router.refresh();
      }
    });
  }

  function remove(scheduleId: string) {
    start(async () => {
      const res = await fetch(
        `/api/beithady/reports/${reportId}/schedule?scheduleId=${scheduleId}`,
        { method: 'DELETE' }
      );
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="ix-card p-5 space-y-3">
      {schedules.length === 0 && !adding ? (
        <p className="text-sm text-slate-500">No schedules set. {canEdit ? 'Click + Add to schedule recurring delivery.' : 'A Business Analyst can add schedules.'}</p>
      ) : null}

      {schedules.map(s => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700"
        >
          <div className="flex-1 text-sm">
            <span className="font-semibold capitalize text-[#1e3a5f] dark:text-amber-100">
              {s.frequency}
            </span>
            {s.frequency === 'weekly' && s.day_of_week != null
              ? ` on ${DAYS[s.day_of_week]}`
              : null}
            {s.frequency === 'monthly' && s.day_of_month != null
              ? ` on day ${s.day_of_month}`
              : null}
            {' · '}
            <span className="text-slate-600 dark:text-slate-300">
              {String(s.hour_cairo).padStart(2, '0')}:00 Cairo
            </span>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {s.email_recipients.length ? (
                <span className="inline-flex items-center gap-1">
                  <Mail size={11} /> {s.email_recipients.length}
                </span>
              ) : null}
              {s.wa_channel_ids.length ? (
                <span className="inline-flex items-center gap-1">
                  <MessageCircle size={11} /> {s.wa_channel_ids.length}
                </span>
              ) : null}
              {s.next_fire_at ? (
                <span>
                  Next: {new Date(s.next_fire_at).toLocaleString('en', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <button
              onClick={() => remove(s.id)}
              disabled={pending}
              className="text-slate-400 hover:text-rose-600"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ))}

      {canEdit && !adding ? (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3a5f] hover:underline"
        >
          <Plus size={12} /> Add schedule
        </button>
      ) : null}

      {adding ? (
        <div className="space-y-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>
              Frequency
              <select
                value={freq}
                onChange={e => setFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              Hour (Cairo)
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={e => setHour(Number(e.target.value))}
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
              />
            </label>
            {freq === 'weekly' ? (
              <label>
                Day of week
                <select
                  value={dow}
                  onChange={e => setDow(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {freq === 'monthly' ? (
              <label>
                Day of month
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dom}
                  onChange={e => setDom(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
                />
              </label>
            ) : null}
          </div>
          <div className="text-xs">
            <label>
              Email recipients (comma-separated)
              <input
                type="text"
                value={emails}
                onChange={e => setEmails(e.target.value)}
                placeholder="ops@beithady.com, manager@beithady.com"
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
              />
            </label>
          </div>
          <div className="text-xs">
            <label>
              WhatsApp phone numbers (comma-separated, with country code)
              <input
                type="text"
                value={waPhones}
                onChange={e => setWaPhones(e.target.value)}
                placeholder="+201234567890, +971501234567"
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1 dark:bg-slate-800 dark:border-slate-700"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
