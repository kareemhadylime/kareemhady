'use client';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { manualRefresh } from '../actions';

export function RefreshButton() {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => manualRefresh())}
      disabled={pending}
      className="ix-btn-secondary"
    >
      <RefreshCw size={14} className={pending ? 'animate-spin' : ''} />
      {pending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
