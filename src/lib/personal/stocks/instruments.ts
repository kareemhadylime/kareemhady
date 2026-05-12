export function slugifyInstrumentName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type StockTradeMatch = {
  side: 'buy' | 'sell';
  qty: number;
  name: string;
  invoiceId: string | null;
  price: number;
};

// AOLB statement descriptions come in two forms:
//   Full:      "Buy 100 T M G Holding/L.E./1/Egypt Stock Exchange (inv. 40079967) @44.000"
//   Truncated: "Buy 7500 Six of October Development & Investment (SODIC)/L. (inv. 50017855) @62.350"
// The source export occasionally truncates the currency/venue suffix to just
// "/L." (no "E./1/...") — see 59 rows across the AOLB 2024/2025/2026 statements.
// Match both: name (lazy) → /L. → optional E./1/<venue> (no parens, so name parens
// like "(SODIC)" don't get swallowed) → (inv. NNN) → @price.
const STOCK_RE =
  /^(Buy|Sell)\s+(\d+)\s+(.+?)\/L\.(?:E\.\/1\/[^()]*)?\s*\(inv\.\s+(\d+)\)\s+@([\d.]+)/i;

export function parseStockDescription(desc: string | null): StockTradeMatch | null {
  if (!desc) return null;
  const m = STOCK_RE.exec(desc.trim());
  if (!m) return null;
  return {
    side: m[1].toLowerCase() as 'buy' | 'sell',
    qty: parseInt(m[2], 10),
    name: m[3].trim(),
    invoiceId: m[4],
    price: parseFloat(m[5]),
  };
}

export type FundTradeMatch = {
  side: 'buy' | 'sell';
  qty: number;
  name: string;
  price: number;
};

const FUND_RE = /^\s*(Buy|Sell)\s+(\d+)\s+ICS\s+\((.+?)\)\s+@([\d.]+)/i;

export function parseFundDescription(desc: string | null): FundTradeMatch | null {
  if (!desc) return null;
  const m = FUND_RE.exec(desc);
  if (!m) return null;
  return {
    side: m[1].toLowerCase() as 'buy' | 'sell',
    qty: parseInt(m[2], 10),
    name: m[3].trim(),
    price: parseFloat(m[4]),
  };
}
