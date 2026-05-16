'use client';
import { useEffect, useState } from 'react';

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR', 'AED'] as const;

export function SettingsForm() {
  const [charityGoalEgpYear, setCharityGoal] = useState<string>('');
  const [defaultCurrency, setDefaultCurrency] = useState<string>('EGP');
  const [monthlySnapshotDay, setSnapshotDay] = useState<string>('1');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/personal/networth/setup/settings');
      const json = await res.json();
      if (json.ok && json.settings) {
        setCharityGoal(
          json.settings.charity_goal_egp_year != null
            ? String(json.settings.charity_goal_egp_year)
            : '',
        );
        setDefaultCurrency(json.settings.default_currency ?? 'EGP');
        setSnapshotDay(String(json.settings.monthly_snapshot_day ?? 1));
      }
      setLoaded(true);
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedAt(null);
    const res = await fetch('/api/personal/networth/setup/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        charityGoalEgpYear: charityGoalEgpYear ? Number(charityGoalEgpYear) : null,
        defaultCurrency,
        monthlySnapshotDay: Number(monthlySnapshotDay),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!json.ok) {
      setError(json.error ?? 'Failed to save');
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }

  if (!loaded) {
    return (
      <section className="ix-card p-5">
        <p className="text-sm text-slate-500">Loading…</p>
      </section>
    );
  }

  return (
    <section className="ix-card p-5 space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>
      <form onSubmit={save} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col text-xs">
          <span className="mb-1">Charity goal (EGP / year)</span>
          <input
            type="number"
            min="0"
            step="100"
            className="ix-input"
            value={charityGoalEgpYear}
            onChange={e => setCharityGoal(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Default currency</span>
          <select
            className="ix-input"
            value={defaultCurrency}
            onChange={e => setDefaultCurrency(e.target.value)}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="mb-1">Snapshot day (1-28)</span>
          <input
            type="number"
            min="1"
            max="28"
            className="ix-input"
            value={monthlySnapshotDay}
            onChange={e => setSnapshotDay(e.target.value)}
          />
        </label>
        <button type="submit" className="ix-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && <span className="text-xs text-emerald-600">Saved at {savedAt}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    </section>
  );
}
