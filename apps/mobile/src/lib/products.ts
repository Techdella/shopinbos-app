import type { EditableVariantRow, ProductKind } from "@shared/product-edit";
import type { ProductTypeKey } from "@shared/product-types";
import { api } from "./api";

// One product in the seller's shop, for the product editor (app/product/[id].tsx).
//   GET    /api/app/store-products/[id]   the product, its variants and (dropship) the supplier and cost
//   PATCH  /api/store/products/[id]       save: the same route and rules as the web form (only changed fields)
//   DELETE /api/store/products/[id]       archive: it leaves the shop (the web's "Archived")
//   POST   /api/upload                    a new photo (folder "products"), as the web form uploads them

export interface EditProduct {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice: number | null;
  currentStock: number;
  lowStockThreshold: number;
  status: string;
  inventoryType: string;
  kind: ProductKind;
  tracksStock: boolean;
  /** Versions (sizes, colours…): price and stock are edited here and saved as variantUpdates. */
  variants: EditableVariantRow[];
  productType: ProductTypeKey;
  /** The type's details ({ fieldKey: value }); care instructions and warranty are their own fields. */
  productDetails: Record<string, string>;
  careInstructions: string | null;
  warranty: string | null;
  dropship: {
    relationshipId: string;
    paused: boolean;
    supplier: { userId: string; name: string; city: string | null };
    cost: number;
    supplierStock: number;
    sale: { shopperPays: number; supplierGets: number; fee: number; keep: number; keepPct: number };
  } | null;
}

export const fetchEditProduct = (id: string) => api<EditProduct>(`/api/app/store-products/${encodeURIComponent(id)}`);

export const saveProduct = (id: string, patch: Record<string, unknown>) =>
  api<unknown>(`/api/store/products/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export const archiveProduct = (id: string) => api<unknown>(`/api/store/products/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function uploadProductPhoto(photo: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const form = new FormData();
  const type = photo.mimeType ?? "image/jpeg";
  // React Native's FormData takes { uri, name, type } file parts.
  form.append("file", { uri: photo.uri, name: photo.fileName ?? `product.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  form.append("folder", "products");
  const data = await api<{ publicUrl: string }>("/api/upload", { method: "POST", body: form });
  return data.publicUrl;
}
