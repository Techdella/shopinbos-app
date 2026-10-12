// Who gets to see a storefront. Pure (no imports) so the rules are unit-tested and shared by the public
// store API, the shopper pages and the owner preview.

/** A store is open to shoppers once it is active and has a published storefront (a page or an editor snapshot). */
export function hasPublishedStorefront(brandSettings: unknown, publishedPageCount: number) {
  if (publishedPageCount > 0) return true;
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return false;
  const editor = (brandSettings as Record<string, unknown>).editor;
  return Boolean(editor && typeof editor === "object" && !Array.isArray(editor) && (editor as Record<string, unknown>).published);
}

export type StoreUnavailableReason = "inactive" | "unpublished";

/** Why shoppers can't see the store yet, or null when it is live. */
export function storeUnavailableReason(store: { status: string; brandSettings: unknown }, publishedPageCount: number): StoreUnavailableReason | null {
  if (store.status !== "active") return "inactive";
  if (!hasPublishedStorefront(store.brandSettings, publishedPageCount)) return "unpublished";
  return null;
}

/**
 * live: everyone sees it. preview: not live, but the signed-in owner is looking (bag, wishlist and checkout
 * render, nothing is charged or ordered). closed: not live and not the owner ("This store isn't open yet").
 */
export type StorefrontAccess = "live" | "preview" | "closed";

export function storefrontAccess(live: boolean, isOwner: boolean): StorefrontAccess {
  if (live) return "live";
  return isOwner ? "preview" : "closed";
}

/** Products the owner sees in preview: drafts too, so the bag and checkout can be tried before anything is published. */
export const PREVIEW_PRODUCT_STATUSES = ["published", "draft"] as const;
