/**
 * Format a sequence number as a BH-NNN company ID.
 * Valid range: 1–999. Throws for out-of-range values.
 */
export function formatCompanyId(n: number): string {
  if (n < 1 || n > 999) {
    throw new Error(`Company ID sequence ${n} out of range 1–999`);
  }
  return `BH-${String(n).padStart(3, '0')}`;
}
