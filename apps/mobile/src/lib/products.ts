import type { EditableVariantRow, ProductKind } from "@shared/product-edit";
import type { ProductTypeKey } from "@shared/product-types";
import type { ProductVariant, VariantOption } from "@shared/product-variants";
import type { MoreSource } from "./product-more-pure";
import type { PreorderState } from "./preorder-pure";
import { api } from "./api";
import type { CategoryLite, StoreCategory } from "./categories-pure";
import type { ProductItem } from "./dashboard";
import { productListPath, type ProductListQuery } from "./product-filters-pure";

// One product in the seller's shop, for the product editor (app/product/[id].tsx).
//   GET    /api/app/store-products/[id]   the product, its variants and (dropship) the supplier and cost
//   PATCH  /api/store/products/[id]       save: the same route and rules as the web form (only changed fields)
//   DELETE /api/store/products/[id]       archive: it leaves the shop (the web's "Archived")
//   POST   /api/upload                    a new photo (folder "products"), as the web form uploads them

export interface EditProduct extends MoreSource {
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
  /** The short code customers quote ("BAG2"); older servers leave it out. */
  shortCode?: string | null;
  /** Its page on the storefront, for Share to WhatsApp; older servers leave it out. */
  url?: string;
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
    /** The supplier takes preorders on this listing (shoppers' preorders follow it); null when not. Newer servers. */
    preorder?: PreorderState | null;
  } | null;
  /** "dropship" when it sells a supplier's stock (newer servers). */
  fulfillmentType?: string | null;
  /** Its own preorder settings (shared/preorder.ts), saved as `preorder` { enabled, shipsAt, limit, note } with the
   *  rest of the form. Newer servers; dropship products can't take their own. */
  preorder?: { enabled: boolean; shipsOn: string | null; limit: number | null; taken: number; note: string | null; depositPct?: number };
  /** The versions in full and their options, so sizes and colours can be added or removed (older servers leave
   *  these out; then only price, stock and on/off of the versions above can change). */
  variantOptions?: VariantOption[];
  variantRows?: ProductVariant[];
  /** Its category (older servers leave these out). Saved as categoryId; the server can't clear it. */
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
}

// ─── Categories (web /home/categories) ───────────────────────────────────────
//   GET  /api/store/categories   the shop's categories (the ones its products use) with product counts
//   GET  /api/public/categories  every category (they're shared by all shops), for the picker
//   POST /api/app/categories     a new category ({ name }), as the web's new-product form makes one

export type { StoreCategory };

export const fetchStoreCategories = () => api<StoreCategory[]>("/api/store/categories");

/** The Products list with the web's filters (status chips, low stock, dropship, category, sort). */
export const fetchProductList = (query: ProductListQuery) => api<ProductItem[]>(productListPath(query));

export const fetchAllCategories = () => api<CategoryLite[]>("/api/public/categories");

export const createCategory = (name: string) => api<CategoryLite & { slug: string }>("/api/app/categories", { method: "POST", json: { name } });

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

/** Find product by code: the one product (not archived) with exactly this short code ("bag2" finds BAG2), or null. */
export async function fetchProductByCode(code: string): Promise<ProductItem | null> {
  const rows = await api<ProductItem[]>(`/api/store/products?code=${encodeURIComponent(code)}&status=!archived&limit=1`);
  return rows[0] ?? null;
}
