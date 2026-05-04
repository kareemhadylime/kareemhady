// Pure render-side helpers for email rows. Lives in `lib/` (no React)
// so server components, client components, and tests can all import it.

// Detect a "fresh booking" reservation email — the kind worth a green
// marker on the triage list. Matches the common subject patterns from
// Airbnb / Booking.com / Expedia / Vrbo / Guesty webhooks:
//   - "New reservation: <X>"       (Airbnb / Guesty)
//   - "New booking - <X>"           (Booking.com / Expedia)
//   - "Reservation confirmed: ..."  (Airbnb)
//   - "Booking confirmed: ..."      (Expedia / Booking)
//   - "Booking received from <X>"   (Vrbo)
//   - "New stay <X>"                (some Guesty templates)
//
// Intentionally narrow — we don't want every Airbnb message
// (payouts, reviews, inquiries) lighting up green; only the
// not-yet-handled new-stay events.
const NEW_RESERVATION_PATTERN =
  /(new\s+(?:reservation|booking)|reservation\s+confirmed|booking\s+(?:confirmed|received)|new\s+stay)\b/i;

// Category gate. The pattern alone fires on marketing copy too
// ("Time for a new booking deal!") so we restrict the marker to
// emails that have actually been classified as Beithady — those are
// the ones backed by a real booking-platform sender and thus
// trustworthy as "new reservation" signals.
const RESERVATION_CATEGORY = 'subsidiary_beithady';

export function isNewReservation(
  subject: string | null | undefined,
  category?: string | null,
): boolean {
  if (!subject) return false;
  // If a category is provided and it isn't Beithady, skip the marker.
  // Calls that don't pass a category (older callsites) get the legacy
  // subject-only behaviour.
  if (category !== undefined && category !== null && category !== RESERVATION_CATEGORY) {
    return false;
  }
  return NEW_RESERVATION_PATTERN.test(subject);
}

// Detect emails that need immediate intervention — verify-account
// prompts, suspicious-activity alerts, frozen/blocked card notices,
// declined transactions, account-expiring warnings, payment failures,
// missed/unpaid invoices, etc. Triggers a red "URGENT" marker in
// the UI.
//
// Patterns:
//   - "urgent" / "important: action required"
//   - "verify your account" / "verify your identity"
//   - "suspicious" / "fraud" / "unauthorized"
//   - "blocked" / "frozen" / "locked" / "suspended"
//   - "declined" / "failed" / "rejected"
//   - "past due" / "overdue" / "expir(ed|ing)"
//   - "payment (declined|failed|missed|required)" / "missed payment"
//   - "invoice (unpaid|overdue|past due)"
//   - "security alert" / "security warning"
const URGENT_PATTERN =
  /\b(urgent|action\s+required|verify\s+your|suspicious|fraud(?:ulent)?|unauthorized|blocked|frozen|locked|suspended|declined|past\s+due|overdue|expir(?:ed|ing)|payment\s+(?:declined|failed|missed|required|unpaid)|missed\s+payment|invoice\s+(?:unpaid|overdue|past\s+due)|security\s+(?:alert|warning|notice)|attention\s+required|important:?\s*(?:action|response|notice))\b/i;

// Only fire the urgency marker for categories where it's actionable.
// Promotion emails like "URGENT: Last chance — 50% off!" should not
// light up red. `bills_receipts` is included so an unpaid/overdue
// invoice from a vendor (PriceLabs, etc.) gets the RED badge even
// when its category routing landed in Bills.
const URGENT_CATEGORIES: ReadonlySet<string> = new Set([
  'banking',
  'security',
  'action_required',
  'bills_receipts',
  'technology',
]);

export function isImmediateIntervention(
  subject: string | null | undefined,
  category?: string | null,
): boolean {
  if (!subject) return false;
  if (category && !URGENT_CATEGORIES.has(category)) return false;
  return URGENT_PATTERN.test(subject);
}

// Detect a "to pay" invoice email — the kind that's an actual payable
// item that should be tracked, not a routine receipt of something
// already paid. Triggers a yellow "TO PAY" marker in the UI so the
// user can find unpaid Beithady invoices at a glance.
//
// Match: subject contains "invoice" or "proforma" or "payment due" /
// "due" / "outstanding" / "to be paid" / "payable" / "settle" /
// "payment request". Excludes "paid" / "received" / "confirmation"
// (those are receipts, not invoices to pay).
const INVOICE_TO_PAY_PATTERN =
  /\b(invoice|proforma|payment\s+(?:due|request)|outstanding|to\s+be\s+paid|payable|please\s+(?:pay|settle))\b/i;

const INVOICE_PAID_NEGATION_PATTERN =
  /\b(payment\s+(?:received|confirmation|confirmed)|invoice\s+paid|paid\s+invoice|receipt\s+for|already\s+paid)\b/i;

// Categories where an invoice subject is plausibly a payable. Tightly
// scoped so a "Re: Vendor invoice attached" in personal correspondence
// or a "Newsletter: Top 10 invoice tools" don't light up.
const INVOICE_CATEGORIES: ReadonlySet<string> = new Set([
  'subsidiary_beithady',
  'bills_receipts',
  'banking',
]);

export function isInvoiceToBePaid(
  subject: string | null | undefined,
  category?: string | null,
): boolean {
  if (!subject) return false;
  if (category && !INVOICE_CATEGORIES.has(category)) return false;
  if (INVOICE_PAID_NEGATION_PATTERN.test(subject)) return false;
  return INVOICE_TO_PAY_PATTERN.test(subject);
}

// Detect emails where the mailbox owner is NOT in the To header —
// meaning the user is on CC, BCC, or part of a list blast. Renders
// as a gray FYI marker and demotes the row in the drill-down sort.
export function isLowPriority(
  toAddress: string | null | undefined,
  accountEmail: string | null | undefined,
): boolean {
  if (!accountEmail) return false;
  const normalizedAccount = accountEmail.toLowerCase();
  if (!toAddress) return true; // no To header at all = blast/list
  return !toAddress.toLowerCase().includes(normalizedAccount);
}

// Sort tier for the drill-down view. Lower number = higher precedence.
// Marked rows (urgent / to-pay / new-reservation / needs-review) bubble
// to the top of the list — but only WHILE THEY'RE STILL ACTIONABLE
// (Gmail UNREAD label still present, INBOX label still present, user
// hasn't manually moved them). Once the user reads / archives / moves
// a marked row, it drops to the natural date-sorted tier.
//
// Low-priority rows (CC-only / blast / not addressed to me) sit BELOW
// normal rows so the inbox foreground is the mail actually directed
// at the user.
export type MarkerInputs = {
  subject: string | null;
  category: string | null;
  category_method?: string | null;
  needs_review?: boolean | null;
  label_ids?: string[] | null;
  to_address?: string | null;
  account_email?: string | null;
};

export function markerTier(row: MarkerInputs): number {
  const labels = row.label_ids ?? [];
  const stillUnread = labels.includes('UNREAD');
  const stillInInbox = labels.includes('INBOX');
  const movedManually = row.category_method === 'manual';
  const actionable = stillUnread && stillInInbox && !movedManually;

  // Marked + still actionable → top of list, in marker precedence.
  if (actionable) {
    if (isImmediateIntervention(row.subject, row.category)) return 0;
    if (isInvoiceToBePaid(row.subject, row.category)) return 1;
    if (isNewReservation(row.subject, row.category)) return 2;
    if (row.needs_review) return 3;
  }

  // Low-priority (CC-only, broadcast, not addressed to me) drops to
  // tier 12 so it sits below normal mail.
  if (isLowPriority(row.to_address ?? null, row.account_email ?? null)) {
    return 12;
  }

  return 10;
}
