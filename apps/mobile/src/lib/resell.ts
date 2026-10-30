import { api, appHeaders } from "./api";

// Resell (pilot "resell", shared/resell.ts): the shop's switch on a product, its resell sales, and the reseller's
// products, links and sales. Every call sends the app headers, so the server checks the switch for this app.

export type ProductResell = { enabled: boolean; commissionPct: number; links: number };

export type ResellSale = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  productName: string;
  resellerName?: string;
  storeName?: string;
  quantity: number;
  lineTotal: number;
  commissionPct: number;
  commissionAmount: number;
  status: string;
  createdAt: string;
};

export type ResellTotals = { owed: number; ready: number; paid: number; count: number; value: number };

/** The person's payout ledger totals (Admin › Payouts): owed to them on the Friday list and paid, airtime included. */
export type ResellLedger = { owed: number; paid: number; airtime: number; lastPaidAt: string | null };

export type ResellableProduct = {
  productId: string;
  name: string;
  image: string | null;
  price: number;
  currency: string;
  commissionPct: number;
  commissionEach: number;
  storeName: string;
  link: string | null;
  clicks: number;
};

export function fetchProductResell(productId: string) {
  return api<ProductResell>(`/api/app/resell/products/${encodeURIComponent(productId)}`, { headers: appHeaders() });
}

export function saveProductResell(productId: string, input: { enabled: boolean; commissionPct: number }) {
  return api<ProductResell>(`/api/app/resell/products/${encodeURIComponent(productId)}`, { method: "PUT", json: input, headers: appHeaders() });
}

export function fetchResellSales() {
  return api<{ sales: ResellSale[]; totals: ResellTotals }>("/api/app/resell/sales", { headers: appHeaders() });
}

export function fetchResellMarket() {
  return api<{ products: ResellableProduct[]; sales: ResellSale[]; totals: ResellTotals; ledger?: ResellLedger | null }>("/api/app/resell/market", { headers: appHeaders() });
}

export function getResellLink(productId: string) {
  return api<{ link: string; code: string; created: boolean }>("/api/app/resell/links", { method: "POST", json: { productId }, headers: appHeaders() });
}
