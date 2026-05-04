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
// declined transactions, account-expiring warnings, etc. Triggers a
// red "URGENT" marker in the UI.
//
// Patterns:
//   - "urgent" / "important: action required"
//   - "verify your account" / "verify your identity"
//   - "suspicious" / "fraud" / "unauthorized"
//   - "blocked" / "frozen" / "locked" / "suspended"
//   - "declined" / "failed" / "rejected"
//   - "past due" / "overdue" / "expir(ed|ing)"
//   - "security alert" / "security warning"
const URGENT_PATTERN =
  /\b(urgent|action\s+required|verify\s+your|suspicious|fraud(?:ulent)?|unauthorized|blocked|frozen|locked|suspended|declined|past\s+due|overdue|expir(?:ed|ing)|security\s+(?:alert|warning|notice)|attention\s+required|important:?\s*(?:action|response|notice))\b/i;

// Only fire the urgency marker for categories where it's actionable.
// Promotion emails like "URGENT: Last chance — 50% off!" should not
// light up red.
const URGENT_CATEGORIES: ReadonlySet<string> = new Set([
  'banking',
  'security',
  'action_required',
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
