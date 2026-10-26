import { api } from "./api";
import type { EditorDraft, EditorOp } from "./shop-edit-pure";

export * from "./shop-edit-pure";

// Edit my shop: the web builder's own data and save routes (src/app/builder, src/app/api/store/editor).
//   GET   /api/store/editor           the store (name, logo, link, published products) and its draft design
//   PATCH /api/store/editor { ops }   change the draft (announcement, banner, colours, sections, featured products)
//   PATCH /api/app/store              the shop's name, and its tagline (brandSettings.tagline, as Settings saves it)
// The logo is the Brand kit logo (lib/identity.ts uploadIdentityImage). Shoppers see the changes once the seller
// publishes (lib/publish.ts).

export interface EditorProduct {
  id: string;
  name: string;
  images: string[];
}

export interface EditorData {
  store: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    storefrontUrl?: string | null;
    brandSettings?: Record<string, unknown> | null;
    storeProducts: EditorProduct[];
  };
  draft: EditorDraft | null;
  published: EditorDraft | null;
}

export const fetchEditor = () => api<EditorData>("/api/store/editor");

export const saveEditorOps = (ops: EditorOp[]) => api<{ draft: EditorDraft }>("/api/store/editor", { method: "PATCH", json: { ops } });

export function saveShopDetails(patch: { name?: string; tagline?: string }) {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.tagline !== undefined) body.brandSettings = { tagline: patch.tagline.trim() };
  return api<unknown>("/api/app/store", { method: "PATCH", json: body });
}

export const shopTagline = (data: EditorData | null) => {
  const value = data?.store.brandSettings?.tagline;
  return typeof value === "string" ? value : "";
};
