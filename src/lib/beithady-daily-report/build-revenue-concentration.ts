import type {
  BuildingBucket,
  BuildingCode,
  ChannelMix,
  ConcentrationRow,
  RevenueConcentrationSection,
} from './types';
import { BUILDING_CODES } from './types';

/**
 * Pure function: derives revenue concentration breakdowns from per-building +
 * channel-mix data already produced by the existing builders. No IO. Used by
 * the Performance Dashboard's "Revenue concentration · Pareto" panel.
 */
export function buildRevenueConcentration(
  perBuilding: Record<BuildingCode, BuildingBucket>,
  channelMix: ChannelMix[]
): RevenueConcentrationSection {
  // Buildings — total + sorted rows
  const buildingsTotal = BUILDING_CODES.reduce(
    (sum, code) => sum + (perBuilding[code]?.revenue_mtd_usd ?? 0),
    0
  );
  const byBuilding: ConcentrationRow[] = BUILDING_CODES.map((code) => {
    const rev = perBuilding[code]?.revenue_mtd_usd ?? 0;
    return {
      key: code,
      revenue_usd: rev,
      pct_of_total: buildingsTotal > 0 ? (rev / buildingsTotal) * 100 : 0,
    };
  }).sort((a, b) => b.revenue_usd - a.revenue_usd);

  // Channels — already typed with pct in the payload, but recompute to be safe
  const channelsTotal = (channelMix ?? []).reduce((sum, c) => sum + (c.revenue_usd ?? 0), 0);
  const byChannel: ConcentrationRow[] = (channelMix ?? [])
    .map((c) => ({
      key: c.channel,
      revenue_usd: c.revenue_usd,
      pct_of_total: channelsTotal > 0 ? (c.revenue_usd / channelsTotal) * 100 : 0,
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);

  const top3BuildingPct = byBuilding.slice(0, 3).reduce((s, r) => s + r.pct_of_total, 0);
  const top1ChannelPct = byChannel[0]?.pct_of_total ?? 0;

  return {
    by_building: byBuilding,
    by_channel: byChannel,
    top3_building_pct: top3BuildingPct,
    top1_channel_pct: top1ChannelPct,
  };
}
