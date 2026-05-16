'use client';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../modals/confirm-dialog';

type Lender = {
  id: string;
  name: string;
  kind: string;
  contact: string | null;
  notes: string | null;
};

const KINDS = ['bank', 'bnpl', 'card_issuer', 'person', 'other'] as const;
type Kind = (typeof KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  bank: 'Bank',
  bnpl: 'BNPL',
  card_issuer: 'Card issuer',
  person: 'Person',
  other: 'Other',
};

export function LendersSection() {
  const [lenders, setLenders] = useState<Lender[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState<string>('');
  const [kind, setKind] = useState<Kind>('bank');
  const [contact, setContact] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Lender | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/personal/networth/setup/lenders');
    const json = await res.json();
    if (json.ok) setLenders(json.lenders);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch('/api/personal/networth/setup/lenders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        kind,
        contact: contact || null,
        notes: notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.ok) {
      setError(json.error ?? 'Failed to add lender');
      return;
    }
    setName('');
    setContact('');
    setNotes('');
    void load();
  }

  async function performDelete(id: string) {
    const res = await fetch(`/api/personal/networth/setup/lenders?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!json.ok) {
      throw new Error(json.error ?? 'Delete failed');
    }
    void load();
  }

  return (
    <section className="ix-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">Lenders</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Counterparties for liabilities — banks, BNPL providers, card issuers, individuals.
      </p>

      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col text-xs">
          <span className="mb-1">Name</span>
          <input
            type="text"
            className="ix-input"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Kind</span>
          <select
            className="ix-input"
            value={kind}
            onChange={e => setKind(e.target.value as Kind)}
          >
            {KINDS.map(k => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Contact</span>
          <input
            type="text"
            className="ix-input"
            value={contact}
            onChange={e => setContact(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Notes</span>
          <input
            type="text"
            className="ix-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        <button type="submit" className="ix-btn-primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add lender'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : lenders.length === 0 ? (
        <p className="text-sm text-slate-500">No lenders yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2">Name</th>
              <th className="py-2">Kind</th>
              <th className="py-2">Contact</th>
              <th className="py-2">Notes</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lenders.map(l => (
              <tr key={l.id} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 font-medium">{l.name}</td>
                <td className="py-2">{KIND_LABEL[l.kind as Kind] ?? l.kind}</td>
                <td className="py-2 text-slate-500">{l.contact ?? ''}</td>
                <td className="py-2 text-slate-500">{l.notes ?? ''}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setPendingDelete(l)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete lender"
        tone="danger"
        confirmLabel="Delete"
        message={
          pendingDelete ? (
            <p>
              Delete <span className="font-medium text-slate-900 dark:text-slate-100">&ldquo;{pendingDelete.name}&rdquo;</span>?
            </p>
          ) : null
        }
        onConfirm={async () => {
          if (!pendingDelete) return;
          await performDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
