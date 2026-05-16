import 'server-only';
import { listAssetPerformance, type AssetPerformanceRow } from './reporting';

export async function getTopAssets(opts: {
  buildingCode?: string;
  limit?: number;
}): Promise<AssetPerformanceRow[]> {
  return listAssetPerformance({ buildingCode: opts.buildingCode, limit: opts.limit ?? 20 });
}
