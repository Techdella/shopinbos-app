// Storefront layouts for CMS collections: how the list page lays out items, and how each item's page looks.
// The collection picks both; an item can override its page layout (kept in its data under ITEM_LAYOUT_KEY,
// which can't clash with a field because field keys always start with a letter).

export const LIST_LAYOUTS = ["grid", "list", "magazine", "compact"] as const;
export type ListLayout = (typeof LIST_LAYOUTS)[number];

export const ITEM_LAYOUTS = ["classic", "wide", "sidebar", "minimal"] as const;
export type ItemLayout = (typeof ITEM_LAYOUTS)[number];

export const ITEM_LAYOUT_KEY = "_layout";

export const isListLayout = (value: unknown): value is ListLayout => LIST_LAYOUTS.includes(value as ListLayout);
export const isItemLayout = (value: unknown): value is ItemLayout => ITEM_LAYOUTS.includes(value as ItemLayout);

/** The item's own layout if it picked one, else the collection's. */
export function itemLayoutOf(data: unknown, fallback: ItemLayout): ItemLayout {
  const own = data && typeof data === "object" ? (data as Record<string, unknown>)[ITEM_LAYOUT_KEY] : undefined;
  return isItemLayout(own) ? own : fallback;
}

/** The seller's item list shows cards or rows; the list-style layouts show rows. */
export const adminView = (layout: ListLayout): "grid" | "list" => (layout === "list" || layout === "compact" ? "list" : "grid");
