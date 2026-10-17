// The shop page's browsing: which layout the seller picked (filters column, category tiles, category rows, category
// chips), what a shopper filtered by, and the products that leaves. Filters live in the address (?category=&min=
// &max=&sort=&instock=&sale=&tag=) so a filtered shop can be shared, refreshed and left with Back.
// Pure data: used by both storefront renderers and loaded by tests without a bundler.

import { listingSoldOut } from "../../../../shared/product-stock.ts";
import { searchProducts } from "./catalog.ts";

// ─── Seller settings (the shop page's product section) ──────────────────────

/** "classic" is the shop grid stores had before these layouts: it keeps its own look and settings. */
export type ShopLayout = "classic" | "filters" | "tiles" | "carousels" | "chips";
export const SHOP_LAYOUTS: ShopLayout[] = ["classic", "filters", "tiles", "carousels", "chips"];

export type ShopSort = "featured" | "newest" | "price-low" | "price-high" | "rating";
export const SHOP_SORTS: ShopSort[] = ["featured", "newest", "price-low", "price-high", "rating"];
export const SHOP_SORT_LABELS: Record<ShopSort, string> = {
  featured: "Featured",
  newest: "Newest",
  "price-low": "Price: low to high",
  "price-high": "Price: high to low",
  rating: "Best rated",
};

export type ShopFilterKey = "category" | "price" | "instock" | "sale" | "tags";
export const SHOP_FILTER_KEYS: ShopFilterKey[] = ["category", "price", "instock", "sale", "tags"];
export const DEFAULT_SHOP_FILTERS: ShopFilterKey[] = ["category", "price", "instock", "sale"];

export interface ShopLayoutOptions {
  layout: ShopLayout;
  /** Products a row on computers. Phones always show two. */
  columns: 2 | 3 | 4;
  /** The filters the filters column (and the phone drawer) shows, in this order. */
  filters: ShopFilterKey[];
  defaultSort: ShopSort;
  /** "(12)" next to each category. */
  showCounts: boolean;
  /** Category rows: how many categories get a row, and how many products each row holds. */
  carouselRows: number;
  carouselProducts: number;
  /** Products shown before "Show more"; null shows them all. */
  pageSize: number | null;
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const raw = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

export function isShopLayout(value: unknown): value is ShopLayout {
  return SHOP_LAYOUTS.includes(value as ShopLayout);
}

export function isShopSort(value: unknown): value is ShopSort {
  return SHOP_SORTS.includes(value as ShopSort);
}

/**
 * The shop page layout settings, with safe defaults. A section saved before these layouts has no `shopLayout`, so it
 * reads as "classic" and the store looks exactly as it did.
 */
export function readShopLayoutOptions(settings: Record<string, unknown> | undefined): ShopLayoutOptions {
  const layout = str(settings?.shopLayout);
  const resolved: ShopLayout = isShopLayout(layout) ? layout : "classic";
  const columns = str(settings?.columns);
  const fallbackColumns = resolved === "filters" ? 3 : 4;
  const rawFilters = settings?.shopFilters;
  const filters = Array.isArray(rawFilters)
    ? SHOP_FILTER_KEYS.filter((key) => rawFilters.includes(key)).sort((a, b) => rawFilters.indexOf(a) - rawFilters.indexOf(b))
    : DEFAULT_SHOP_FILTERS;
  const sort = str(settings?.defaultSort);
  const pageSize = str(settings?.pageSize);
  return {
    layout: resolved,
    columns: columns === "2" ? 2 : columns === "3" ? 3 : columns === "4" || columns === "5" ? 4 : fallbackColumns,
    filters,
    defaultSort: isShopSort(sort) ? sort : "featured",
    showCounts: settings?.showCounts !== false,
    carouselRows: clampInt(settings?.carouselRows, 1, 12, 6),
    carouselProducts: clampInt(settings?.carouselProducts, 4, 16, 8),
    // These layouts are made for big catalogues: unset shows 24 then "Show more"; "all" shows everything.
    pageSize: pageSize === "all" ? null : clampInt(pageSize || undefined, 4, 96, 24),
  };
}

// ─── What the shopper picked (kept in the address) ──────────────────────────

export interface ShopQuery {
  /** Category slug; "" is every category. */
  category: string;
  /** Collection id; "" is none. A collection and a category are never both picked. */
  collection: string;
  min: number | null;
  max: number | null;
  /** "" uses the section's default sort. */
  sort: ShopSort | "";
  inStock: boolean;
  onSale: boolean;
  tags: string[];
  /** Category rows: "all" shows every product as a grid instead of the rows. */
  view: "" | "all";
  /** Words typed into the shop's search box (never written to the address: ?q= opens the search sheet). */
  q: string;
}

export const EMPTY_SHOP_QUERY: ShopQuery = { category: "", collection: "", min: null, max: null, sort: "", inStock: false, onSale: false, tags: [], view: "", q: "" };

/** Address keys the shop page owns; other pages drop them. */
export const SHOP_QUERY_KEYS = ["category", "collection", "min", "max", "sort", "instock", "sale", "tag", "view"] as const;

function price(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

const flag = (value: string | null) => value === "1" || value === "true" || value === "yes";

export function parseShopQuery(input: URLSearchParams | string): ShopQuery {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const text = (key: string) => (params.get(key) ?? "").trim().slice(0, 80);
  const sort = text("sort");
  let min = price(params.get("min"));
  let max = price(params.get("max"));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const rawCategory = text("category");
  const category = rawCategory === "all" ? "" : rawCategory;
  const collection = category ? "" : text("collection");
  const tags = [...new Set(params.getAll("tag").map((tag) => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 10);
  return {
    category,
    collection,
    min,
    max,
    sort: isShopSort(sort) ? sort : "",
    inStock: flag(params.get("instock")),
    onSale: flag(params.get("sale")),
    tags,
    view: text("view") === "all" ? "all" : "",
    q: "",
  };
}

/** The address query for a shop query, keeping any other parameters (campaign tags, previews) as they were. */
export function shopQueryParams(query: ShopQuery, base?: URLSearchParams | string): URLSearchParams {
  const params = new URLSearchParams(base ?? "");
  for (const key of SHOP_QUERY_KEYS) params.delete(key);
  if (query.category) params.set("category", query.category);
  else if (query.collection) params.set("collection", query.collection);
  if (query.min !== null) params.set("min", String(query.min));
  if (query.max !== null) params.set("max", String(query.max));
  if (query.sort) params.set("sort", query.sort);
  if (query.inStock) params.set("instock", "1");
  if (query.onSale) params.set("sale", "1");
  for (const tag of query.tags) params.append("tag", tag);
  if (query.view === "all" && !query.category && !query.collection) params.set("view", "all");
  return params;
}

/** Same filters (sort and search aside): used to tell whether the address needs writing. */
export function sameShopQuery(a: ShopQuery, b: ShopQuery) {
  return shopQueryParams(a).toString() === shopQueryParams(b).toString() && a.q === b.q;
}

/** Picking a category or collection (or none). Clears the other one and leaves the "every product" view. */
export function withGroup(query: ShopQuery, group: { kind: "category" | "collection"; key: string } | null): ShopQuery {
  if (!group) return { ...query, category: "", collection: "", view: "" };
  return group.kind === "category" ? { ...query, category: group.key, collection: "", view: "" } : { ...query, collection: group.key, category: "", view: "" };
}

// ─── Products ───────────────────────────────────────────────────────────────

export interface BrowseProduct {
  id: string;
  name: string;
  description?: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice?: number | null;
  category?: { id: string; name: string; slug: string; imageUrl?: string | null } | null;
  avgRating?: number;
  reviewCount?: number;
  tags?: string[];
  supplierProduct?: { stockQuantity?: number | null } | null;
  stock?: { continueSelling: boolean; left: number } | null;
}

export interface BrowseCollection {
  id: string;
  name: string;
  imageUrl?: string | null;
  productIds: string[];
}

export function inStock(product: BrowseProduct) {
  return !listingSoldOut(product as Parameters<typeof listingSoldOut>[0]);
}

export function onSale(product: Pick<BrowseProduct, "compareAtPrice" | "retailPrice">) {
  return typeof product.compareAtPrice === "number" && product.compareAtPrice > product.retailPrice;
}

function tagKey(tag: string) {
  return tag.trim().toLowerCase();
}

type Skip = "group" | "price" | "instock" | "sale" | "tags";

/** The products a query leaves, in the order given. `skip` leaves one filter out (for counts next to its options). */
export function filterShopProducts<P extends BrowseProduct>(products: P[], query: ShopQuery, collections: BrowseCollection[] = [], skip?: Skip): P[] {
  let list = query.q ? searchProducts(products as never[], query.q) as unknown as P[] : products;
  if (skip !== "group") {
    const collection = query.collection ? collections.find((entry) => entry.id === query.collection) : undefined;
    if (collection) {
      const ids = new Set(collection.productIds);
      list = list.filter((product) => ids.has(product.id));
    } else if (query.category) {
      list = list.filter((product) => product.category?.slug === query.category);
    }
  }
  if (skip !== "price" && (query.min !== null || query.max !== null)) {
    list = list.filter((product) => (query.min === null || product.retailPrice >= query.min) && (query.max === null || product.retailPrice <= query.max));
  }
  if (skip !== "instock" && query.inStock) list = list.filter(inStock);
  if (skip !== "sale" && query.onSale) list = list.filter(onSale);
  if (skip !== "tags" && query.tags.length) {
    const wanted = new Set(query.tags.map(tagKey));
    list = list.filter((product) => (product.tags ?? []).some((tag) => wanted.has(tagKey(tag))));
  }
  return list;
}

/**
 * Products in shop order. The store's products arrive newest first: "Newest" keeps that order, "Featured" keeps it
 * but moves sold-out products to the end, "Best rated" puts the best average (with the most reviews) first.
 */
export function sortShopProducts<P extends BrowseProduct>(products: P[], sort: ShopSort): P[] {
  const indexed = products.map((product, index) => ({ product, index }));
  const by = (compare: (a: P, b: P) => number) => indexed.sort((a, b) => compare(a.product, b.product) || a.index - b.index).map((entry) => entry.product);
  switch (sort) {
    case "newest":
      return [...products];
    case "price-low":
      return by((a, b) => a.retailPrice - b.retailPrice);
    case "price-high":
      return by((a, b) => b.retailPrice - a.retailPrice);
    case "rating":
      return by((a, b) => (b.reviewCount ? b.avgRating ?? 0 : 0) - (a.reviewCount ? a.avgRating ?? 0 : 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    default:
      return by((a, b) => Number(!inStock(a)) - Number(!inStock(b)));
  }
}

export interface ShopGroup {
  kind: "category" | "collection";
  key: string;
  name: string;
  /** The group's first product photo, else the category's own picture. */
  image: string | null;
  /** Products in the group that match the other filters. */
  count: number;
  /** Products in the group with no other filter. */
  total: number;
}

/**
 * Collections (the seller's order) then categories (the order products arrive in), each with its product count under
 * the shopper's other filters. Groups with no products at all are left out.
 */
export function shopGroups<P extends BrowseProduct>(products: P[], collections: BrowseCollection[], query: ShopQuery = EMPTY_SHOP_QUERY): ShopGroup[] {
  const matching = new Set(filterShopProducts(products, query, collections, "group").map((product) => product.id));
  const groups: ShopGroup[] = [];
  const byId = new Map(products.map((product) => [product.id, product]));
  for (const collection of collections) {
    const members = collection.productIds.map((id) => byId.get(id)).filter((product): product is P => Boolean(product));
    if (!members.length) continue;
    groups.push({
      kind: "collection",
      key: collection.id,
      name: collection.name,
      image: collection.imageUrl || members.find((product) => product.images[0])?.images[0] || null,
      count: members.filter((product) => matching.has(product.id)).length,
      total: members.length,
    });
  }
  const categories = new Map<string, ShopGroup>();
  for (const product of products) {
    const category = product.category;
    if (!category?.slug) continue;
    const entry = categories.get(category.slug) ?? { kind: "category" as const, key: category.slug, name: category.name, image: null, count: 0, total: 0 };
    entry.image = entry.image ?? product.images[0] ?? null;
    entry.total += 1;
    if (matching.has(product.id)) entry.count += 1;
    categories.set(category.slug, entry);
  }
  for (const product of products) {
    const entry = product.category?.slug ? categories.get(product.category.slug) : undefined;
    if (entry && !entry.image && product.category?.imageUrl) entry.image = product.category.imageUrl;
  }
  return [...groups, ...categories.values()];
}

/** The most-used tags (as first written), with how many products under the other filters carry each. */
export function shopTags<P extends BrowseProduct>(products: P[], query: ShopQuery = EMPTY_SHOP_QUERY, collections: BrowseCollection[] = [], limit = 12) {
  const matching = new Set(filterShopProducts(products, query, collections, "tags").map((product) => product.id));
  const map = new Map<string, { tag: string; total: number; count: number }>();
  for (const product of products) {
    for (const tag of new Set((product.tags ?? []).map((entry) => entry.trim()).filter(Boolean))) {
      const key = tagKey(tag);
      const entry = map.get(key) ?? { tag, total: 0, count: 0 };
      entry.total += 1;
      if (matching.has(product.id)) entry.count += 1;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag)).slice(0, limit);
}

/** Lowest and highest price in a list (whole numbers), or null for an empty list. */
export function priceBounds(products: Array<Pick<BrowseProduct, "retailPrice">>) {
  if (!products.length) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const product of products) {
    low = Math.min(low, product.retailPrice);
    high = Math.max(high, product.retailPrice);
  }
  return { min: Math.floor(low), max: Math.ceil(high) };
}

export type ActiveFilter =
  | { id: "group"; kind: "category" | "collection"; value: string }
  | { id: "price"; min: number | null; max: number | null }
  | { id: "instock" }
  | { id: "sale" }
  | { id: `tag:${string}`; value: string };

/** The filters a shopper has on, for the "remove" chips above the products. Sort is not a filter. */
export function activeShopFilters(query: ShopQuery): ActiveFilter[] {
  const list: ActiveFilter[] = [];
  if (query.category) list.push({ id: "group", kind: "category", value: query.category });
  else if (query.collection) list.push({ id: "group", kind: "collection", value: query.collection });
  if (query.min !== null || query.max !== null) list.push({ id: "price", min: query.min, max: query.max });
  if (query.inStock) list.push({ id: "instock" });
  if (query.onSale) list.push({ id: "sale" });
  for (const tag of query.tags) list.push({ id: `tag:${tag}`, value: tag });
  return list;
}

/** The query with one active filter taken off. */
export function withoutFilter(query: ShopQuery, id: ActiveFilter["id"]): ShopQuery {
  if (id === "group") return withGroup(query, null);
  if (id === "price") return { ...query, min: null, max: null };
  if (id === "instock") return { ...query, inStock: false };
  if (id === "sale") return { ...query, onSale: false };
  const tag = id.slice(4);
  return { ...query, tags: query.tags.filter((entry) => entry !== tag) };
}

/** "Clear all": every filter off; the sort the shopper chose stays. */
export function clearShopFilters(query: ShopQuery): ShopQuery {
  return { ...EMPTY_SHOP_QUERY, sort: query.sort };
}

/** Everything the shop shows for a query: filtered, then sorted (the section's default sort when none is picked). */
export function browseShop<P extends BrowseProduct>(products: P[], query: ShopQuery, collections: BrowseCollection[], defaultSort: ShopSort): P[] {
  return sortShopProducts(filterShopProducts(products, query, collections), query.sort || defaultSort);
}
