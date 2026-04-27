// Display metadata for booking channels. Maps Guesty's
// `integration_platform` strings to a human-readable label + an accent
// colour for reservation bars.

export type ChannelMeta = {
  label: string;
  color: string;       // CSS hex
  textColor: string;   // CSS hex
  shortCode: string;   // 3-char code for compact bars
};

const CHANNELS: Record<string, ChannelMeta> = {
  airbnb2:    { label: 'Airbnb',      color: '#FF5A5F', textColor: '#fff',     shortCode: 'AIR' },
  airbnb:     { label: 'Airbnb',      color: '#FF5A5F', textColor: '#fff',     shortCode: 'AIR' },
  bookingCom: { label: 'Booking.com', color: '#003580', textColor: '#fff',     shortCode: 'BDC' },
  vrbo:       { label: 'Vrbo',        color: '#0F4C81', textColor: '#fff',     shortCode: 'VRB' },
  expedia:    { label: 'Expedia',     color: '#FFC72C', textColor: '#1A1A1A',  shortCode: 'EXP' },
  hopper:     { label: 'Hopper',      color: '#7B61FF', textColor: '#fff',     shortCode: 'HOP' },
  manual:     { label: 'Direct',      color: '#0F766E', textColor: '#fff',     shortCode: 'DIR' },
  direct:     { label: 'Direct',      color: '#0F766E', textColor: '#fff',     shortCode: 'DIR' },
  website:    { label: 'Website',     color: '#0E7490', textColor: '#fff',     shortCode: 'WEB' },
};

const FALLBACK: ChannelMeta = {
  label: 'Other',
  color: '#64748B',
  textColor: '#fff',
  shortCode: 'OTH',
};

export function channelMeta(platform: string | null | undefined): ChannelMeta {
  if (!platform) return FALLBACK;
  return CHANNELS[platform] || FALLBACK;
}
