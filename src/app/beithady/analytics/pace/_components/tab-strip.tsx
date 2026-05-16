'use client';

type TabItem<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  tabs: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
};

/**
 * Brand-locked horizontal tabs. Matches the "Revenue / Booked Days / ANR"
 * and "By Property / By City" tab patterns in the Guesty Pace Report.
 * Inactive tabs are muted #6077a6; active is navy #003462 with a navy
 * underline. No raw Tailwind palette classes.
 */
export function TabStrip<T extends string>({ tabs, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center justify-center gap-6 border-b border-[#003462]/10 pb-1"
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`relative pb-2 text-sm transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2 rounded ${
              active
                ? 'text-[#003462] font-semibold'
                : 'text-[#6077a6] hover:text-[#003462]'
            }`}
            style={{ fontFamily: 'var(--bh-heading)' }}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-[5px] left-0 right-0 h-[2px] bg-[#003462]"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
