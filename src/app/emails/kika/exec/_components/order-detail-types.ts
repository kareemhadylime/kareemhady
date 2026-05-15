// Shared type for the KIKA order-detail popup. Lives in a neutral module
// (not the route.ts) so the client modal can import it without dragging
// the `server-only` route handler into the client bundle.

export type ShopifyAddress = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  country_code?: string | null;
  zip?: string | null;
  phone?: string | null;
  company?: string | null;
};

export type KikaOrderDetail = {
  id: number;
  name: string | null;
  shop_domain: string | null;
  email: string | null;
  phone: string | null;
  customer_id: number | null;
  customer_name: string | null;
  created_at: string | null;
  processed_at: string | null;
  cancelled_at: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string | null;
  subtotal: number | null;
  total: number | null;
  total_discounts: number | null;
  total_tax: number | null;
  total_shipping: number | null;
  refunded_amount: number | null;
  tags: string[] | null;
  note: string | null;
  payment_gateways: string[];
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  discount_codes: Array<{ code: string; amount: number | null; type: string | null }>;
  shipping_lines: Array<{ title: string; price: number | null; code: string | null }>;
  fulfillments: Array<{
    id: number | null;
    status: string | null;
    created_at: string | null;
    tracking_number: string | null;
    tracking_company: string | null;
    tracking_url: string | null;
  }>;
  line_items: Array<{
    id: number;
    title: string | null;
    name: string | null;
    sku: string | null;
    vendor: string | null;
    quantity: number | null;
    price: number | null;
    total_discount: number | null;
    line_total: number | null;
  }>;
};
