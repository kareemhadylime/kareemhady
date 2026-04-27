// Daily Morning Brief — shared types for the three role-specific
// brief generators (Guest Relations / Ops / Finance).

export type BriefRole = 'guest_relations' | 'ops' | 'finance';

export type BriefRecipient = {
  source: 'auto' | 'extra';
  label: string;
  email: string | null;
  whatsapp: string | null;     // E.164 digits, no '+'
};

export type BriefSection = {
  title: string;
  emoji: string;
  items: BriefItem[];
  empty_message?: string;       // shown when items.length === 0
};

export type BriefItem = {
  primary: string;              // headline
  secondary?: string;           // gray detail line
  tag?: { label: string; tone: 'red' | 'amber' | 'green' | 'violet' | 'cyan' | 'slate' };
  href?: string;                // app-relative link
};

export type Brief = {
  role: BriefRole;
  date_iso: string;             // YYYY-MM-DD
  cairo_label: string;          // "Tue 28 Apr 2026"
  sections: BriefSection[];
  summary: Record<string, number>;  // { arrivals: 3, unpaid: 2, ... } for trend tracking
};
