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
}

export const fetchOrder = (id: string) => api<OrderDetail>(`/api/app/orders/${id}`);

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
