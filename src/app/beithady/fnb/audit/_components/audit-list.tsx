'use client';
import { useEffect, useState } from 'react';

interface AuditEvent {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  at: string;
}

export function AuditList({ showPayloads }: { showPayloads: boolean }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  useEffect(() => {
    fetch('/api/beithady/fnb/audit').then(r => r.json()).then(j => setEvents(j.events ?? []));
  }, []);
  return (
    <ul className="divide-y text-sm">
      {events.map(e => (
        <li key={e.id} className="py-2">
          <div className="flex justify-between">
            <span><strong>{e.action}</strong> · {e.target_type ?? '—'}#{(e.target_id ?? '').slice(0,8)}</span>
            <span className="text-xs text-slate-500">{new Date(e.at).toLocaleString()}</span>
          </div>
          {showPayloads && Boolean(e.before ?? e.after) && (
            <pre className="text-xs mt-1 bg-slate-50 dark:bg-slate-800 p-2 rounded overflow-auto">
              {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
            </pre>
          )}
        </li>
      ))}
      {events.length === 0 && <li className="text-slate-400 py-2">No events.</li>}
    </ul>
  );
}
