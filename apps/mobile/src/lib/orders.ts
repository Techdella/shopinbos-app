import type { RecordedSaleChannel } from "@shared/channels";
import type { SaleDelivery, SalePayment } from "@shared/sales";
import { api } from "./api";
import type { OrderRow } from "./dashboard";

// /api/app/orders on the web backend.

export interface OrderItem {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  /** Its product's short code ("BAG2"), when the product still has one. */
  shortCode?: string;
  /** A preorder line (shared/preorder.ts): it ships from `shipsOn` (YYYY-MM-DD) or soon. */
  preorder?: boolean;
  shipsOn?: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  deliveryAddress: { street?: string; city?: string; state?: string } | null;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discountAmount: number | null;
  total: number;
  notes: string | null;
  channel: string | null;
  paymentMethod: string | null;
  trackingCode: string | null;
  createdAt: string;
  row: OrderRow;
  /** Parcels and anything to decide (src/lib/supplier-orders/parts.server.ts); null when no supplier sends any of it. */
  parts?: OrderParts | null;
  /** The customer's order page on the storefront (unguessable id), for "Share tracking". Older servers leave it out. */
  trackingUrl?: string | null;
  /** A line was preordered: the earliest ship date (or null: soon). Null for an ordinary order; older servers leave it out. */
  preorder?: { shipsOn: string | null } | null;
}

/** One parcel: a supplier's, or the seller's own ("You"). */
export interface OrderPart {
  key: string;
  kind: "supplier" | "own";
  name: string;
  label: string;
  state: "waiting" | "preparing" | "sent" | "delivered" | "problem";
  items: string;
  trackingCode: string | null;
  supplierOrderId: string | null;
}

/** A supplier who didn't accept in time (or declined): switched automatically, or the seller chooses. */
export interface OrderProblem {
  supplierOrderId: string;
  supplierName: string;
  status: string;
  items: string;
  productName: string;
  /** What "Find another supplier" searches for. */
  searchQuery: string;
  switched: { toSupplierOrderId: string; toName: string; message: string; costWords: string; canUndo: boolean; accepted: boolean } | null;
  undone: boolean;
  needsChoice: boolean;
}

export interface OrderParts {
  /** "2 of 3 parcels sent" (null for one parcel). */
  line: string | null;
  total: number;
  sent: number;
  parts: OrderPart[];
  problems: OrderProblem[];
  canCancelAndRefund: boolean;
}

export const fetchOrder = (id: string) => api<OrderDetail>(`/api/app/orders/${id}`);

/** Undo an automatic switch to another supplier (until they accept). */
export const undoSupplierSwitch = (id: string, supplierOrderId: string) =>
  api<OrderDetail>(`/api/app/orders/${id}/supplier-switch/undo`, { method: "POST", json: { supplierOrderId } });

/** Cancel the order and give the customer their money back (a supplier didn't accept in time). */
export const cancelAndRefund = (id: string) => api<OrderDetail & { message: string }>(`/api/app/orders/${id}/cancel-refund`, { method: "POST", json: {} });

export const updateOrder = (id: string, body: { status: string; paymentMethod?: string; logisticsType?: "personal" | "pickup" }) =>
  api<OrderDetail>(`/api/app/orders/${id}`, { method: "PATCH", json: body });

export interface RecordSaleBody {
  buyerName: string;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  items: Array<{ productId?: string | null; name: string; price: number; quantity: number }>;
  payment: SalePayment;
  delivery: SaleDelivery;
  deliveryFee?: number;
  address?: { street: string; city: string; state?: string } | null;
  channel: RecordedSaleChannel;
  notes?: string | null;
}

export const recordSale = (body: RecordSaleBody) => api<OrderDetail>("/api/app/orders", { method: "POST", json: body });
