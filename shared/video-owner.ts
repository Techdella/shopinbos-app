// Who owns a Rex video (VideoProject) and what each kind of owner can do with it. Pure and zod-free, so the web
// routes, the phone (apps/mobile/src/lib/video-pure.ts) and tests/partner-videos.test.mjs all share it.
//
// OWNER ID RULE (no migration): VideoProject.storeId is a plain String with no foreign key. It holds the id of
// whoever owns the video:
//   - a seller          → their Store.id
//   - a delivery partner → their LogisticsPartner.id (role "logistics_partner")
// Ids are cuids, so a partner id never matches a store id: every store-scoped reader (ads, social posts, Peggy's ad
// tools, the hub's lists) simply never sees a partner's videos. Partners have no products and no Shopinbos ads, so
// the shop-only places (a product page, an ad) are hidden for them and refused by PATCH /api/app/videos/[id].

export const VIDEO_ROLES = ["seller", "logistics_partner"] as const;
export type VideoRole = (typeof VIDEO_ROLES)[number];

export type VideoPurposeKey = "ad" | "product" | "social";
export type VideoPlace = "product" | "ad" | "social";

export function isVideoRole(role: unknown): role is VideoRole {
  return typeof role === "string" && (VIDEO_ROLES as readonly string[]).includes(role);
}

/** The id saved in VideoProject.storeId for this person: Store.id for a seller, LogisticsPartner.id for a partner. */
export function videoOwnerId(role: unknown, ids: { storeId?: string | null; partnerId?: string | null }): string | null {
  if (role === "seller") return ids.storeId || null;
  if (role === "logistics_partner") return ids.partnerId || null;
  return null;
}

/** True when the owner has no shop (a delivery partner): no products, no product pages, no Shopinbos ads. */
export function videoWithoutShop(role: unknown) {
  return role === "logistics_partner";
}

/** What a new video can be for. A partner has no products, so "product" is a shop-only purpose. */
export function videoPurposesFor(role: unknown): readonly VideoPurposeKey[] {
  return videoWithoutShop(role) ? (["ad", "social"] as const) : (["ad", "product", "social"] as const);
}

/** Where a finished video can be marked as gone live. A partner can only say they posted it. */
export function videoPlacesFor(role: unknown): readonly VideoPlace[] {
  return videoWithoutShop(role) ? (["social"] as const) : (["product", "ad", "social"] as const);
}

/** The web video studio home for this role (the reel itself is drawn in a browser). */
export function webVideoBase(role: unknown): "/home/video" | "/logistics/video" {
  return videoWithoutShop(role) ? "/logistics/video" : "/home/video";
}

/** The web studio for one draft ("Finish on the web" on the phone). */
export function webVideoStudioPath(role: unknown, id: string) {
  return `${webVideoBase(role)}/studio?id=${encodeURIComponent(id)}`;
}
