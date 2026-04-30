// Beithady · Generate Report · Guesty source → 4 bucket taxonomy.
// Per user clarification: Manual = anything in Guesty NOT routed via OTA
// (Direct, Capital One, Website, Walk-in, owner stays). Other OTA = OTAs
// other than Airbnb / Booking.com (Vrbo, Expedia, Agoda, Hotels.com, etc.).
// DB source-value audit on 2026-04-30 confirmed: airbnb2, manual, Booking.com,
// website, Capital One, owner, Hotels.com, Expedia.

import type { ChannelBucket } from './types';

export function bucketChannel(source: string | null | undefined): ChannelBucket {
  const s = (source || '').toLowerCase().trim();
  if (!s) return 'manual';
  if (s.includes('airbnb')) return 'airbnb';
  if (s.includes('booking')) return 'booking_com';
  if (
    /(vrbo|expedia|agoda|trip\.com|hotelbeds|hostelworld|hotels\.com|google|despegar|kayak|priceline|rentalsunited)/i.test(
      s
    )
  ) {
    return 'other_ota';
  }
  // manual / direct / website / capital one / owner / walk-in / blank → Manual
  return 'manual';
}

export const CHANNEL_LABEL: Record<ChannelBucket, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking.com',
  other_ota: 'Other OTA',
  manual: 'Manual',
};

export const CHANNEL_COLOR: Record<ChannelBucket, string> = {
  airbnb: '#ff5a5f',
  booking_com: '#003580',
  other_ota: '#6b7280',
  manual: '#15803d',
};

export const CHANNEL_BUCKETS: readonly ChannelBucket[] = [
  'airbnb',
  'booking_com',
  'other_ota',
  'manual',
] as const;
