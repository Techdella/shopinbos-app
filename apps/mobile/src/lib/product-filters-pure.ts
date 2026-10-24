// Products list filters (the web's /products chips: All, Live, Draft, Low stock, Dropship, Archived; plus category
// and sort in the Filters sheet) as GET /api/store/products query strings. No imports, so tests load it in Node.

export const PRODUCT_SHOWS = ["all", "live", "draft", "low", "dropship", "archived"] as const;
export type ProductShow = (typeof PRODUCT_SHOWS)[number];

export const PRODUCT_SORTS = ["newest", "sales", "price_low", "price_high", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductListQuery {
  show: ProductShow;
  categoryId: string;
  sort: ProductSort;
}

export const DEFAULT_PRODUCT_QUERY: ProductListQuery = { show: "all", categoryId: "", sort: "newest" };

/** The list address: like the web, "All" leaves archived products out and low stock counts only the seller's own stock. */
export function productListPath(query: ProductListQuery, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit), sort: query.sort });
  if (query.show === "live") params.set("status", "active,published");
  else if (query.show === "draft") params.set("status", "draft");
  else if (query.show === "archived") params.set("status", "archived");
  else params.set("status", "!archived");
  if (query.show === "low") {
    params.set("lowStock", "true");
    params.set("inventoryType", "seller");
  }
  if (query.show === "dropship") params.set("inventoryType", "dropshipping");
  if (query.categoryId) params.set("categoryId", query.categoryId);
  return `/api/store/products?${params.toString()}`;
}

/** Filters picked in the sheet (the status chips are counted apart). */
export const productFilterCount = (query: ProductListQuery) => (query.categoryId ? 1 : 0) + (query.sort !== "newest" ? 1 : 0);
