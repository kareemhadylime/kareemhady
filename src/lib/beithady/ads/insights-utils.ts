export function asInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function asMicros(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0;
}
