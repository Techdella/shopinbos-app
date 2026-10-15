import { api } from "./api";
import { bioSaveBody, createBody, type BioPage, type DraftForm, type DraftLine, type PaymentLinkRow } from "./paylinks-pure";

// Payment links and Link in bio on the phone, the same routes as the web pages:
//   GET   /api/app/payment-links          the shop's links (newest first) and whether it can take payment
//   POST  /api/app/payment-links          make a link for products in the shop
//   PATCH /api/app/payment-links/[id]     { action: "cancel" }
//   GET   /api/app/bio, PUT /api/app/bio  the link in bio page
//   GET   /api/store/products             published products to pick from

export interface PaymentLinksData {
  links: PaymentLinkRow[];
  readiness: { card: boolean; transfer: boolean; payOnDelivery: boolean; ready: boolean };
}

export const fetchPaymentLinks = () => api<PaymentLinksData>("/api/app/payment-links");

export interface CreatedLink {
  id: string;
  code: string;
  url: string;
  total: number;
  title: string | null;
  items: { name?: string; quantity: number }[];
}

export const createPaymentLink = (lines: DraftLine[], form: DraftForm) =>
  api<CreatedLink>("/api/app/payment-links", { method: "POST", json: createBody(lines, form) });

export const cancelPaymentLink = (id: string) =>
  api<{ cancelled: boolean }>(`/api/app/payment-links/${encodeURIComponent(id)}`, { method: "PATCH", json: { action: "cancel" } });

export interface PickProduct {
  id: string;
  name: string;
  images: string[];
  retailPrice: number;
}

/** Published products, best sellers first (what the web's link dialog and bio editor offer). */
export const fetchPublishedProducts = () => api<PickProduct[]>("/api/store/products?status=published&sort=sales&limit=100");

export const fetchBio = () => api<BioPage>("/api/app/bio");

export const saveBio = (page: Parameters<typeof bioSaveBody>[0]) => api<BioPage>("/api/app/bio", { method: "PUT", json: bioSaveBody(page) });
