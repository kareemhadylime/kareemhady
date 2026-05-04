export interface CartLineForMath {
  unit_price_usd: number;
  quantity: number;
  modifiers: Array<{ price_delta_usd: number }>;
}

export function computeLineTotal(l: CartLineForMath): number {
  const lineUnit = l.unit_price_usd
    + l.modifiers.reduce((s, m) => s + m.price_delta_usd, 0);
  return Math.round(lineUnit * l.quantity * 100) / 100;
}

export interface CartTotals {
  total_usd: number;
  vat_usd: number;
  service_usd: number;
  subtotal_usd: number;
}

export function computeCartTotals(lines: CartLineForMath[]): CartTotals {
  const total = lines.reduce((s, l) => s + computeLineTotal(l), 0);
  const total_usd = Math.round(total * 100) / 100;
  const vat_usd = Math.round((total_usd * 14 / 126) * 100) / 100;
  const service_usd = Math.round((total_usd * 12 / 126) * 100) / 100;
  const subtotal_usd = Math.round((total_usd - vat_usd - service_usd) * 100) / 100;
  return { total_usd, vat_usd, service_usd, subtotal_usd };
}
