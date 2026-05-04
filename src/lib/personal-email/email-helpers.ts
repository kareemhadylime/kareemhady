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
