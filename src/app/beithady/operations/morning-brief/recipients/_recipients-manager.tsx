'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ToggleRight, ToggleLeft, Mail, MessageCircle, User } from 'lucide-react';
import {
  addBriefExtraAction,
  deleteBriefExtraAction,
  toggleBriefExtraAction,
} from '../actions';

type Extra = {
  id: string;
  role: 'guest_relations' | 'ops' | 'finance';
  label: string;
  email: string | null;
  whatsapp: string | null;
  enabled: boolean;
  created_at: string;
};

type AutoUser = {
  user_id: string;
  username: string | null;
  whatsapp: string | null;
  roles: string[];
};

const ROLE_LABEL: Record<Extra['role'], string> = {
  guest_relations: 'Guest Relations',
  ops: 'Housekeeping & Ops',
  finance: 'Finance & Accounting',
};

const ROLE_BROADCAST: Record<Extra['role'], string[]> = {
  guest_relations: ['guest_relations', 'manager', 'admin'],
  ops: ['ops', 'manager', 'admin'],
  finance: ['finance', 'manager', 'admin'],
};

export function RecipientsManager({ extras, autoUsers }: { extras: Extra[]; autoUsers: AutoUser[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addRole, setAddRole] = useState<Extra['role']>('guest_relations');
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const submitAdd = () => {
    startTransition(async () => {
      const r = await addBriefExtraAction({
        role: addRole,
        label,
        email: email || undefined,
        whatsapp: whatsapp || undefined,
      });
      if (r.ok) {
        setLabel(''); setEmail(''); setWhatsapp('');
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  const onDelete = (id: string) => {
    if (!confirm('Delete this recipient?')) return;
    startTransition(async () => {
      const r = await deleteBriefExtraAction({ id });
      if (r.ok) router.refresh();
      else alert(`Failed: ${r.error}`);
    });
  };

  const onToggle = (id: string, enabled: boolean) => {
    startTransition(async () => {
      const r = await toggleBriefExtraAction({ id, enabled: !enabled });
      if (r.ok) router.refresh();
      else alert(`Failed: ${r.error}`);
    });
  };

  const roles: Extra['role'][] = ['guest_relations', 'ops', 'finance'];

  return (
    <>
      {roles.map(role => {
        const matchingUsers = autoUsers.filter(u => u.roles.some(r => ROLE_BROADCAST[role].includes(r)));
        const matchingExtras = extras.filter(e => e.role === role);
        return (
          <section key={role} className="ix-card p-4 space-y-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--bh-navy)' }}>
              {ROLE_LABEL[role]}
            </h2>

            {/* Auto-broadcast users (read-only) */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Auto-broadcast ({matchingUsers.length})
              </h3>
              {matchingUsers.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  No users with role {ROLE_BROADCAST[role].join(' / ')} yet.
                </p>
              ) : (
                <ul className="text-[11px] divide-y divide-slate-100 dark:divide-slate-800">
                  {matchingUsers.map(u => (
                    <li key={u.user_id} className="flex items-center gap-2 py-1.5">
                      <User size={12} className="text-slate-400 shrink-0" />
                      <span className="font-medium">{u.username || u.user_id.slice(0, 8)}</span>
                      <span className="text-[10px] text-slate-400">{u.roles.join(', ')}</span>
                      <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-slate-500">
                        {u.username && /\S+@\S+\.\S+/.test(u.username) && (
                          <span className="inline-flex items-center gap-0.5"><Mail size={10} /> ok</span>
                        )}
                        {u.whatsapp && (
                          <span className="inline-flex items-center gap-0.5"><MessageCircle size={10} /> ok</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Admin-added extras */}
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Extra recipients ({matchingExtras.length})
              </h3>
              {matchingExtras.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">No extras yet.</p>
              ) : (
                <ul className="text-[11px] divide-y divide-slate-100 dark:divide-slate-800">
                  {matchingExtras.map(e => (
                    <li key={e.id} className="flex items-center gap-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => onToggle(e.id, e.enabled)}
                        disabled={pending}
                        className={e.enabled ? 'text-emerald-600' : 'text-slate-400'}
                        title={e.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                      >
                        {e.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <span className={`font-medium ${e.enabled ? '' : 'text-slate-400 line-through'}`}>
                        {e.label}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-slate-500">
                        {e.email && <span className="inline-flex items-center gap-0.5"><Mail size={10} /> {e.email}</span>}
                        {e.whatsapp && <span className="inline-flex items-center gap-0.5"><MessageCircle size={10} /> {e.whatsapp}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(e.id)}
                        disabled={pending}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                        aria-label="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {/* Add form */}
      <section className="ix-card p-4 space-y-2">
        <h2 className="text-sm font-bold" style={{ color: 'var(--bh-navy)' }}>
          Add extra recipient
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
          <select
            value={addRole}
            onChange={e => setAddRole(e.target.value as Extra['role'])}
            className="ix-input !text-xs !py-1 !px-2"
          >
            {roles.map(r => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Label (e.g. Mahmoud — A1 accountant)"
            value={label}
            onChange={e => setLabel(e.target.value)}
            className="ix-input !text-xs !py-1 !px-2"
            maxLength={120}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="ix-input !text-xs !py-1 !px-2"
          />
          <input
            type="text"
            placeholder="WhatsApp E.164 (optional)"
            value={whatsapp}
            onChange={e => setWhatsapp(e.target.value)}
            className="ix-input !text-xs !py-1 !px-2"
          />
        </div>
        <button
          type="button"
          onClick={submitAdd}
          disabled={pending || !label.trim()}
          className="ix-btn-primary !text-xs"
        >
          <Plus size={12} /> Add recipient
        </button>
      </section>
    </>
  );
}
