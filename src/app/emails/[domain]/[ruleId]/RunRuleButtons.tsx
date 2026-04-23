'use client';

import { useFormStatus } from 'react-dom';
import { Play, Loader2 } from 'lucide-react';

export function PresetSubmitButton({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5 disabled:cursor-wait ${
        active
          ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:bg-indigo-500'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-70'
      }`}
    >
      {pending && <Loader2 size={13} className="animate-spin" />}
      {pending ? 'Running…' : label}
    </button>
  );
}

function RangeDateInput({
  name,
  defaultValue,
  min,
}: {
  name: string;
  defaultValue: string;
  min: string;
}) {
  const { pending } = useFormStatus();
  return (
    <input
      type="date"
      name={name}
      defaultValue={defaultValue}
      min={min}
      disabled={pending}
      className="ix-input w-[160px] disabled:opacity-60 disabled:cursor-wait"
    />
  );
}

function RangeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="ix-btn-primary disabled:bg-indigo-500 disabled:cursor-wait"
    >
      {pending ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          Running…
        </>
      ) : (
        <>
          <Play size={16} /> Run with this range
        </>
      )}
    </button>
  );
}

export function RangeFormFields({
  fromDefault,
  toDefault,
  yearStartStr,
}: {
  fromDefault: string;
  toDefault: string;
  yearStartStr: string;
}) {
  return (
    <>
      <label className="space-y-1">
        <span className="block text-xs font-medium text-slate-700">From</span>
        <RangeDateInput
          name="from"
          defaultValue={fromDefault}
          min={yearStartStr}
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs font-medium text-slate-700">To</span>
        <RangeDateInput
          name="to"
          defaultValue={toDefault}
          min={yearStartStr}
        />
      </label>
      <RangeSubmitButton />
    </>
  );
}
