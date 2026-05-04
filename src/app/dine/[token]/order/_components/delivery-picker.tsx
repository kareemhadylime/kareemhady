'use client';

export function DeliveryPicker({
  value, onChange, slaMinutes,
}: {
  value: 'asap' | 30 | 60;
  onChange: (v: 'asap' | 30 | 60) => void;
  slaMinutes: number;
}) {
  const opts: Array<{ key: 'asap' | 30 | 60; label: string }> = [
    { key: 'asap', label: `ASAP (~${slaMinutes} min)` },
    { key: 30, label: 'In 30 min' },
    { key: 60, label: 'In 1 hour' },
  ];
  return (
    <fieldset className="mt-4">
      <legend className="text-xs uppercase tracking-wide font-semibold mb-2">
        Delivery time
      </legend>
      <div className="flex gap-2">
        {opts.map(o => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="flex-1 py-2 text-sm rounded border"
            style={{
              borderColor: value === o.key ? 'var(--bh-navy)' : 'transparent',
              background: value === o.key ? 'var(--bh-navy)' : 'transparent',
              color: value === o.key ? 'var(--bh-on-navy, #FAF8F4)' : 'var(--bh-navy)',
            }}
          >{o.label}</button>
        ))}
      </div>
    </fieldset>
  );
}
