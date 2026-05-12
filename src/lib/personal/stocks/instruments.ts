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
  invoiceId: string;
  price: number;
};

const STOCK_RE =
  /^(Buy|Sell)\s+(\d+)\s+(.+?)\/L\.E\.\/1\/.+?\(inv\.\s+(\d+)\)\s+@([\d.]+)/i;

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
