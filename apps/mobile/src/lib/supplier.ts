import type { VerificationDoc } from "@shared/verification-docs";
import { api, apiBody } from "./api";

// The supplier side of the app. Reads and writes go to the same backend as the web supplier portal:
//   /api/mobile/supplier/overview · orders · orders/[id] · quotes/[id] · products/[id] · upload  (made for the app)
//   /api/supplier/products (list, create) · /api/supplier/quote-requests (list) · /api/supplier/me  (the portal's own API)

export interface SupplierOverview {
  supplier: { name: string; city: string; logoUrl: string | null; verificationStatus: string; onboarded: boolean; documents: number; rating: number; ratingCount: number };
  firstName: string;
  counts: { toPack: number; wholesale: number; quotes: number; lowStock: number; products: number };
  toPack: DropshipOrder[];
  wholesale: WholesaleOrder[];
  quotes: Array<{ id: string; quantity: number; destination: string; seller: string; product: string; image: string | null; createdAt: string }>;
  lowStock: Array<{ id: string; name: string; stock: number; image: string | null }>;
  earned: number;
  bank: { bankName: string; account: string; ready: boolean } | null;
}

export type OrderAction = "accept" | "decline" | "packed" | "handed_over";

export interface DropshipOrder {
  kind: "dropship";
  id: string;
  ref: string;
  status: string;
  mixed: boolean;
  next: OrderAction[];
  shop: string;
  sellerUserId: string | null;
  label: { from: string; to: string; phone: string | null; address: string[]; collect: number };
  items: Array<{ name: string; variant: string | null; quantity: number; image: string | null; yourPrice: number }>;
  yourTotal: number;
  notes: string | null;
  trackingCode: string | null;
  createdAt: string;
}

export interface WholesaleOrder {
  kind: "wholesale";
  id: string;
  ref: string;
  status: string;
  next: OrderAction[];
  shop: string;
  sellerUserId: string;
  sellerName: string;
  sellerPhone: string | null;
  product: { id: string; name: string; image: string | null };
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
  address: string;
  notes: string | null;
  trackingCode: string | null;
  createdAt: string;
}

export type SupplierOrder = DropshipOrder | WholesaleOrder;

export const fetchSupplierOverview = () => api<SupplierOverview>("/api/mobile/supplier/overview");

export const fetchSupplierOrders = (view: "open" | "done") =>
  api<{ view: string; dropship: DropshipOrder[]; wholesale: WholesaleOrder[]; counts: { dropship: number; wholesale: number } }>(`/api/mobile/supplier/orders?view=${view}`);

export const fetchSupplierOrder = (kind: SupplierOrder["kind"], id: string) => api<SupplierOrder>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}?kind=${kind}`);

export const moveSupplierOrder = (kind: SupplierOrder["kind"], id: string, action: OrderAction, trackingCode?: string) =>
  api<SupplierOrder>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}`, { method: "PATCH", json: { kind, action, trackingCode: trackingCode?.trim() || undefined } });

export interface SupplierProduct {
  id: string;
  name: string;
  slug: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  currency: string;
  moq: number;
  stockQuantity: number;
  dropshipAvailable: boolean;
  status: string;
  category: { id: string; name: string } | null;
  _count?: { storeProducts: number; quoteRequests: number };
}

export async function fetchSupplierProducts() {
  const body = await apiBody<{ data: SupplierProduct[] }>("/api/supplier/products?limit=100");
  return body.data ?? [];
}

export const quickEditProduct = (id: string, patch: { stockQuantity?: number; wholesalePrice?: number; suggestedRetailPrice?: number; publish?: boolean }) =>
  api<Pick<SupplierProduct, "id" | "name" | "status" | "stockQuantity" | "wholesalePrice" | "suggestedRetailPrice">>(`/api/mobile/supplier/products/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export interface NewSupplierProduct {
  name: string;
  description: string;
  categoryId: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  moq: number;
  stockQuantity: number;
  dropshipAvailable: boolean;
  bulkOrderAvailable: boolean;
  deliveryRegions: string[];
  processingTime?: string;
  status: "draft" | "pending_review";
}

export const createSupplierProduct = (product: NewSupplierProduct) => api<SupplierProduct>("/api/supplier/products", { method: "POST", json: product });

export async function fetchCategories() {
  const body = await apiBody<{ data: Array<{ id: string; name: string; parentId: string | null }> }>("/api/public/categories");
  return body.data ?? [];
}

export function uploadSupplierPhoto(photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `product.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  return api<{ url: string }>("/api/mobile/supplier/upload", { method: "POST", body: form });
}

export interface QuoteRequest {
  id: string;
  quantity: number;
  destination: string;
  notes: string | null;
  status: string;
  quotedPrice: number | null;
  supplierResponse: string | null;
  expiresAt: string | null;
  createdAt: string;
  seller: { id: string; name: string };
  supplierProduct: { id: string; name: string; images: string[] };
}

export async function fetchQuoteRequests() {
  const body = await apiBody<{ data: QuoteRequest[] }>("/api/supplier/quote-requests?limit=100");
  return body.data ?? [];
}

export interface QuoteDetail {
  id: string;
  quantity: number;
  destination: string;
  notes: string | null;
  status: string;
  quotedPrice: number | null;
  reply: string | null;
  expiresAt: string | null;
  createdAt: string;
  seller: { userId: string; name: string; shop: string | null };
  product: { id: string; name: string; image: string | null; wholesalePrice: number; moq: number; stock: number };
}

export const fetchQuote = (id: string) => api<QuoteDetail>(`/api/mobile/supplier/quotes/${encodeURIComponent(id)}`);

export const replyToQuote = (id: string, body: { intent: "respond"; quotedPrice: number; moq?: number; note?: string; validDays?: number } | { intent: "decline"; note?: string }) =>
  api<QuoteDetail>(`/api/mobile/supplier/quotes/${encodeURIComponent(id)}`, { method: "POST", json: body });

export interface SupplierMe {
  supplier: { displayName: string; businessName: string; verificationStatus: string; verificationDocuments: VerificationDoc[]; trustScore: number };
  user: { name: string; email: string | null } | null;
}

export const fetchSupplierMe = () => api<SupplierMe>("/api/supplier/me");

export const fetchSupplierProduct = (id: string) => api<SupplierProduct & { description: string }>(`/api/supplier/products/${encodeURIComponent(id)}`);
