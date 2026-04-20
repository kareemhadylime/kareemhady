import { anthropic, HAIKU } from '@/lib/anthropic';

export type LineItem = {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ParsedOrder = {
  order_number: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  line_items: LineItem[];
};

export type ProductSummary = {
  name: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
};

export type ShopifyAggregateOutput = {
  order_count: number;
  total_amount: number;
  line_items_subtotal: number;
  currency: string;
  products: ProductSummary[];
  orders: Array<Pick<ParsedOrder, 'order_number' | 'customer_name' | 'total_amount'>>;
  parse_errors: number;
};

const SYSTEM = `You parse Shopify order-notification emails (e.g. from KIKA store) and extract structured order data. Be strict: only extract values clearly present in the email. If a field is missing, omit the order rather than guessing.`;

const TOOL = {
  name: 'extract_order',
  description: 'Extract order number, customer, total, and line items from a Shopify order email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      order_number: { type: 'string', description: 'Order number including any leading # or store prefix.' },
      customer_name: { type: 'string', description: 'Full name of the customer who placed the order.' },
      total_amount: {
        type: 'number',
        description: 'Final total charged to the customer in the order currency, including shipping/tax/discounts. Numeric value only, no currency symbol.',
      },
      currency: { type: 'string', description: 'ISO-like currency code, e.g. EGP, USD. Use EGP if the email uses LE.' },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Product name as shown in the order summary.' },
            quantity: { type: 'number' },
            unit_price: { type: 'number', description: 'Price per unit in the order currency.' },
            total: { type: 'number', description: 'Line total in the order currency (quantity * unit_price).' },
          },
          required: ['name', 'quantity', 'unit_price', 'total'],
        },
      },
    },
    required: ['order_number', 'customer_name', 'total_amount', 'currency', 'line_items'],
  },
};

async function parseOne(bodyText: string): Promise<ParsedOrder | null> {
  const trimmed = bodyText.length > 12000 ? bodyText.slice(0, 12000) : bodyText;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'extract_order' },
    messages: [{ role: 'user', content: trimmed }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  return toolUse.input as ParsedOrder;
}

export async function aggregateShopifyOrders(
  bodies: Array<{ subject: string; from: string; bodyText: string }>,
  currencyHint: string
): Promise<ShopifyAggregateOutput> {
  const parsed: ParsedOrder[] = [];
  let parseErrors = 0;

  const results = await Promise.allSettled(bodies.map(b => parseOne(b.bodyText)));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) parsed.push(r.value);
    else parseErrors++;
  }

  const productMap = new Map<string, ProductSummary>();
  let totalAmount = 0;
  let lineItemsSubtotal = 0;
  let currency = currencyHint;

  for (const order of parsed) {
    totalAmount += order.total_amount || 0;
    if (order.currency) currency = order.currency;
    for (const item of order.line_items) {
      lineItemsSubtotal += item.total || 0;
      const key = item.name.trim().toLowerCase();
      const existing = productMap.get(key);
      if (existing) {
        existing.total_quantity += item.quantity;
        existing.total_revenue += item.total;
        existing.order_count += 1;
      } else {
        productMap.set(key, {
          name: item.name.trim(),
          total_quantity: item.quantity,
          total_revenue: item.total,
          order_count: 1,
        });
      }
    }
  }

  return {
    order_count: parsed.length,
    total_amount: Math.round(totalAmount * 100) / 100,
    line_items_subtotal: Math.round(lineItemsSubtotal * 100) / 100,
    currency,
    products: Array.from(productMap.values()).sort((a, b) => b.total_quantity - a.total_quantity),
    orders: parsed.map(o => ({
      order_number: o.order_number,
      customer_name: o.customer_name,
      total_amount: o.total_amount,
    })),
    parse_errors: parseErrors,
  };
}
