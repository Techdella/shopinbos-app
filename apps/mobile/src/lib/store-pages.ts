import { api } from "./api";
import { collectionSlug } from "./store-pages-pure";

export { collectionSlug };

// Store pages, product collections and content (the CMS) on the phone, through the same routes as the web pages:
//   GET   /api/store/pages                       the shop's pages
//   PATCH /api/store/pages/<id>                  title, live/hidden, search (SEO) words
//   GET   /api/store/collections                 product collections with their product counts
//   POST  /api/store/collections                 a new collection
//   GET   /api/store/collections/<id>            one collection with its products
//   PATCH /api/store/collections/<id>            name and description
//   POST|DELETE /api/store/collections/<id>/products   add or take out products
//   GET   /api/app/cms/collections               content collections (blog, FAQ, lookbook…) and their counts
// Layouts and the rest are edited on the web (the screen says so and opens the right page).

export interface StorePageRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
  isPublished: boolean;
  draftContent?: { seo?: { metaTitle?: string; metaDescription?: string } } | null;
}

export interface ProductCollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
}

export interface ProductCollectionDetail extends ProductCollectionRow {
  products: { product: { id: string; name: string; images: string[] } }[];
}

export interface ContentCollectionRow {
  id: string;
  name: string;
  itemLabel: string;
  itemCount: number;
  liveCount: number;
}

/** The web's own pages (home, products…) are built in the editor; these are the ones a seller names and shows. */
const SYSTEM_TYPES = new Set(["home", "products", "product", "cart", "checkout", "account", "search", "collection"]);

export const fetchStorePages = () => api<StorePageRow[]>("/api/store/pages").then((rows) => rows.filter((row) => !SYSTEM_TYPES.has(row.type)));
export const saveStorePage = (id: string, body: { title?: string; status?: "published" | "hidden"; seo?: { metaTitle?: string; metaDescription?: string } }) =>
  api<StorePageRow>(`/api/store/pages/${encodeURIComponent(id)}`, { method: "PATCH", json: body });

export const fetchProductCollections = () => api<ProductCollectionRow[]>("/api/store/collections?limit=100");
export const fetchProductCollection = (id: string) => api<ProductCollectionDetail>(`/api/store/collections/${encodeURIComponent(id)}`);
export const createProductCollection = (name: string) =>
  api<ProductCollectionRow>("/api/store/collections", { method: "POST", json: { name: name.trim().slice(0, 120), slug: collectionSlug(name) } });
export const saveProductCollection = (id: string, body: { name?: string; description?: string }) =>
  api<ProductCollectionRow>(`/api/store/collections/${encodeURIComponent(id)}`, { method: "PATCH", json: body });
export const addToCollection = (id: string, productIds: string[]) =>
  api<unknown>(`/api/store/collections/${encodeURIComponent(id)}/products`, { method: "POST", json: { productIds } });
export const removeFromCollection = (id: string, productIds: string[]) =>
  api<unknown>(`/api/store/collections/${encodeURIComponent(id)}/products`, { method: "DELETE", json: { productIds } });

export const fetchContentCollections = () => api<ContentCollectionRow[]>("/api/app/cms/collections");
