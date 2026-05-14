// src/lib/beithady/hr/hr-nid.ts

export type NidParseResult = {
  dateOfBirth: string;  // ISO YYYY-MM-DD
  gender: 'male' | 'female';
};

/**
 * Parse an Egyptian National ID (14 digits) and extract date of birth + gender.
 * Returns null if the NID format is invalid.
 *
 * Format: C YY MM DD GG SSSS N
 *   C  = century (2=1900s, 3=2000s)
 *   YY = year within century
 *   MM = month (01-12)
 *   DD = day (01-31)
 *   GG = governorate (01-27)
 *   SSSS = sequence; index 12 (digit 13) parity = gender (odd=male, even=female)
 *   N  = check digit (index 13)
 */
export function parseEgyptianNid(nid: string): NidParseResult | null {
  if (!nid || !/^\d{14}$/.test(nid)) return null;

  const centuryDigit = parseInt(nid[0], 10);
  if (centuryDigit !== 2 && centuryDigit !== 3) return null;

  const century = centuryDigit === 2 ? 1900 : 2000;
  const yy = parseInt(nid.slice(1, 3), 10);
  const mm = parseInt(nid.slice(3, 5), 10);
  const dd = parseInt(nid.slice(5, 7), 10);

  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const year = century + yy;
  const dateOfBirth = [
    String(year),
    String(mm).padStart(2, '0'),
    String(dd).padStart(2, '0'),
  ].join('-');

  // Digit at index 12 (13th digit) determines gender: odd = male
  const genderDigit = parseInt(nid[12], 10);
  const gender: 'male' | 'female' = genderDigit % 2 !== 0 ? 'male' : 'female';

  return { dateOfBirth, gender };
}
