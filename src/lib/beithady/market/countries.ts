// ISO alpha-2 → display name + flag emoji helper. Same flagFor() as
// the CRM helper; duplicated here to keep the market module self-
// contained without a circular import.

export const COUNTRY_NAMES: Record<string, string> = {
  EG: 'Egypt', SA: 'Saudi Arabia', AE: 'UAE', KW: 'Kuwait', QA: 'Qatar',
  BH: 'Bahrain', OM: 'Oman', JO: 'Jordan', LB: 'Lebanon', PS: 'Palestine',
  GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain',
  NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
  SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  PL: 'Poland', CZ: 'Czechia', RU: 'Russia', UA: 'Ukraine', BY: 'Belarus',
  RO: 'Romania', BG: 'Bulgaria', HU: 'Hungary', GR: 'Greece', TR: 'Turkey',
  US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina',
  CN: 'China', JP: 'Japan', KR: 'South Korea', IN: 'India', PK: 'Pakistan',
  ID: 'Indonesia', PH: 'Philippines', TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore',
  AU: 'Australia', NZ: 'New Zealand',
  ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', LY: 'Libya',
  MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', SD: 'Sudan',
  IL: 'Israel', IR: 'Iran', IQ: 'Iraq', SY: 'Syria', YE: 'Yemen',
};

export function countryName(iso: string | null | undefined): string {
  if (!iso) return '—';
  const trimmed = iso.trim().toUpperCase();
  return COUNTRY_NAMES[trimmed] || trimmed;
}

export function flagFor(country: string | null | undefined): string {
  if (!country) return '·';
  const c = country.trim().toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return c.slice(0, 3).toUpperCase();
  const codePoints = [c.charCodeAt(0) + 0x1F1A5, c.charCodeAt(1) + 0x1F1A5];
  return String.fromCodePoint(...codePoints);
}
