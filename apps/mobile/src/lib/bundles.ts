import type { BundleItem } from "@shared/bundles";
import { api } from "./api";

// Bundles ("Buy together", shared/bundles.ts) on the phone, the same routes as the web's /products/bundles:
//   GET   /api/store/products/bundles        the shop's bundles and the products a bundle can hold
//   POST  /api/store/products/bundles        make one { name, price, items: [{ productId, variantId?, quantity }], image?,
//                                            description?, publish? } (variantId: the size picked for a product with sizes)
//   PATCH /api/store/products/bundles/[id]   change one (the whole bundle)
//   DELETE /api/store/products/[id]          remove one (archived like any product)

export interface BundleChoice {
  id: string;
  name: string;
  images: string[];
  retailPrice: number;
  status: string;
  /** Units left when the seller counts stock; null when not counted. */
  stock: number | null;
  /** Its switched-on sizes / options (an item of it picks one); empty or left out: none. */
  variants?: BundleChoiceVariant[];
}

export interface BundleChoiceVariant {
  id: string;
  name: string;
  /** Its own price, else the product's. */
  price: number;
  /** Units left of this one when counted on its own; null: the product's count applies. */
  stock: number | null;
  image: string | null;
}

export interface SellerBundle {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  status: string;
  soldCount: number;
  /** variantId / variant: the size or option picked ("M / Red") for a product that has them. */
  items: Array<{ productId: string; variantId?: string; variant?: string; quantity: number; name: string; image: string | null; price: number; missing: boolean }>;
  partsTotal: number;
  saving: { amount: number; percent: number };
  available: number | null;
}

export interface BundleDraft {
  name: string;
  description: string;
  price: number;
  items: BundleItem[];
  image: string | null;
  publish: boolean;
}

export const fetchBundles = () => api<{ bundles: SellerBundle[]; choices: BundleChoice[] }>("/api/store/products/bundles");

export const saveBundle = (draft: BundleDraft, id?: string | null) =>
  api<SellerBundle>(id ? `/api/store/products/bundles/${encodeURIComponent(id)}` : "/api/store/products/bundles", {
    method: id ? "PATCH" : "POST",
    json: { name: draft.name.trim(), description: draft.description.trim(), price: draft.price, items: draft.items, image: draft.image ?? "", publish: draft.publish },
  });

export const removeBundle = (id: string) => api<null>(`/api/store/products/${encodeURIComponent(id)}`, { method: "DELETE" });
