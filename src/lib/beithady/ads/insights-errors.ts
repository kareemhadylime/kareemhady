export class InsightsBreakdownFetchError extends Error {
  constructor(
    public platform: 'meta' | 'google' | 'tiktok',
    public step: 'auth' | 'quota' | 'http' | 'parse' | 'normalize',
    message: string,
  ) {
    super(`${platform}_breakdown_${step}: ${message}`);
    this.name = 'InsightsBreakdownFetchError';
  }
}

export class InsightsUpsertError extends Error {
  constructor(public table: 'geo' | 'demo' | 'device', message: string) {
    super(`insights_upsert[${table}]: ${message}`);
    this.name = 'InsightsUpsertError';
  }
}
