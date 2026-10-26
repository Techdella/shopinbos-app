import type { PackContent, PackDesign, PackFormat, ProductType } from "@shared/packaging";
import { api } from "./api";
import type { DeliveryZone } from "./packaging-pure";
import { payInApp } from "./pay";

export * from "./packaging-pure";

// Packaging and labels (app/packaging.tsx), on the web's own routes: GET/POST /api/app/print-designs (saved
// designs), GET /api/app/print-designs/[id] (one design), POST /api/app/packaging/copy (Peggy writes the words; it
// spends AI credits), POST /api/app/print-orders (prices it on the server and starts the Paystack checkout) and
// POST /api/app/packaging/requests ("make it for me", the branding team sends a quote).

export interface SavedDesign {
  id: string;
  kind: "packaging" | "label";
  format: string;
  title: string;
  previewUrl: string | null;
  updatedAt: string;
}

export const fetchDesigns = () => api<SavedDesign[]>("/api/app/print-designs");

export const fetchDesign = (id: string) => api<{ id: string; title: string; design: PackDesign; previewUrl: string | null }>(`/api/app/print-designs/${encodeURIComponent(id)}`);

export const saveDesign = (input: { id: string | null; title: string; design: PackDesign }) =>
  api<{ id: string; title: string; updatedAt: string }>("/api/app/print-designs", { method: "POST", json: { kind: "packaging", ...input } });

export const writeWords = (design: PackDesign, productName: string) =>
  api<{ content: Partial<PackContent>; ai: boolean }>("/api/app/packaging/copy", {
    method: "POST",
    json: { productType: design.productType, name: productName, productId: design.productId, brief: null, current: design.content },
  });

export interface PrintOrderInput {
  designId: string;
  quantity: number;
  zone: DeliveryZone;
  contactName: string;
  contactPhone: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

/** Default material, matte; proofOk: the screen says paying confirms the design was checked. */
/** Prints are physical goods, paid on Paystack in an in-app browser that comes back by itself (lib/pay.ts). */
export const orderPrints = (input: PrintOrderInput) =>
  payInApp((app) => api<{ id: string; reference?: string; authorizationUrl: string }>("/api/app/print-orders", { method: "POST", json: { ...input, finish: "matte", material: null, proofOk: true, app } }));

export const askTeam = (input: { designId: string | null; productName: string; productType: ProductType; packType: PackFormat; quantity: number; details: string; contactName: string; contactPhone: string }) =>
  api<{ id: string; status: string }>("/api/app/packaging/requests", { method: "POST", json: { ...input, services: ["design", "print"], referenceUrls: [] } });
