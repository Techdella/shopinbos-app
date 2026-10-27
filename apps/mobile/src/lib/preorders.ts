import { api } from "./api";
import type { PreorderStage, StorePreorderStage } from "./preorder-pure";

// The preorder lists on the phone (server: src/lib/supplier-orders/preorders.server.ts; rules: shared/preorder.ts):
//   supplier  GET/POST /api/mobile/supplier/preorders   open bulk preorders by product, "Stock is ready", "End preorders"
//   seller    GET /api/app/preorders?view=suppliers     their bulk preorders from suppliers (Pay deposit / Pay balance)
//             GET/POST /api/app/preorders (view=shop)   their store's preorders from shoppers by product, "Stock is ready"
// Paying goes through lib/wallet.ts payWholesaleOrder (the same Paystack path as any bulk order).

export interface SupplierPreorderGroup {
  product: { id: string; slug: string; name: string; image: string | null; on: boolean; shipsOn: string | null; limit: number | null; taken: number; depositPct: number };
  units: number;
  shops: number;
  waiting: number;
  totalKobo: number;
  paidKobo: number;
  dueKobo: number;
  orders: Array<{ id: string; shop: string; sellerId: string; quantity: number; status: string; stage: PreorderStage; totalKobo: number; depositKobo: number; paidKobo: number; dueKobo: number; createdAt: string }>;
}

export const fetchSupplierPreorders = () => api<{ groups: SupplierPreorderGroup[] }>("/api/mobile/supplier/preorders");

/** "Stock is ready" (optionally ending preorders too) or "End preorders"; answers with the fresh list. */
export const supplierPreorderAction = (productId: string, action: "ready" | "end", end?: boolean) =>
  api<{ groups: SupplierPreorderGroup[]; marked?: number; told?: number; ended: boolean }>("/api/mobile/supplier/preorders", { method: "POST", json: { productId, action, ...(end ? { end: true } : {}) } });

export interface SellerWholesalePreorder {
  id: string;
  status: string;
  quantity: number;
  totalPrice: number;
  currency: string;
  createdAt: string;
  supplier: { id: string; name: string; userId: string };
  product: { id: string; name: string; slug: string; image: string | null };
  canPay: boolean;
  pay: { step: "deposit" | "balance" | "full"; kobo: number } | null;
  preorder: { shipsOn: string | null; stage: PreorderStage; readyAt: string | null; depositKobo: number; depositPaid: boolean; paidKobo: number; dueKobo: number } | null;
}

export const fetchSellerWholesalePreorders = () => api<{ orders: SellerWholesalePreorder[] }>("/api/app/preorders?view=suppliers");

export interface StorePreorderGroup {
  productId: string;
  name: string;
  image: string | null;
  shipsOn: string | null;
  units: number;
  waiting: number;
  unpaid: number;
  /** Customers who paid a deposit and still owe the rest (older servers: absent). */
  balanceDue?: number;
  orders: Array<{
    id: string; orderNumber: string; buyerName: string; status: string; quantity: number; stage: StorePreorderStage; createdAt: string;
    /** Balance due (stage balance_due): kobo still owed, when it's due (once asked) and whether it's overdue. */
    dueKobo?: number; balanceDueOn?: string | null; overdue?: boolean;
  }>;
  product: { on: boolean; shipsOn: string | null; limit: number | null; taken: number; depositPct?: number } | null;
}

export const fetchStorePreorders = () => api<{ groups: StorePreorderGroup[] }>("/api/app/preorders?view=shop");

export const storePreorderAction = (productId: string, action: "ready" | "end", end?: boolean) =>
  api<{ groups: StorePreorderGroup[]; moved?: number; asked?: number; unpaid?: number; ended: boolean }>("/api/app/preorders", { method: "POST", json: { productId, action, ...(end ? { end: true } : {}) } });

/** A customer who paid a deposit: they paid the rest another way, or (overdue) cancel; the deposit is then owed back. */
export const storeBalanceAction = (orderId: string, action: "balance_paid" | "cancel_unpaid") =>
  api<{ groups: StorePreorderGroup[]; message: string }>("/api/app/preorders", { method: "POST", json: { orderId, action } });

/** Orders in a group waiting to be asked for the rest (deposit paid, not asked yet): "Stock is ready" asks them. */
export const toAsk = (group: StorePreorderGroup) => group.orders.filter((order) => order.stage === "balance_due" && !order.balanceDueOn).length;
