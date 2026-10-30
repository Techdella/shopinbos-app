import { api } from "./api";

// Your shop link & QR (app/shop-link.tsx): the shop's @handle, its short link (app.shopinbos.com/@handle) and the
// QR code. Same route as the web's Shop link & QR page: GET /api/app/store/handle (gives the shop a handle the first
// time), PATCH { handle } to change it (owner only). Rules: shared/shop-handle.ts.

export interface ShopLink {
  handle: string | null;
  at: string | null;
  shortUrl: string;
  shortHost: string;
  storeUrl: string;
  storeName: string;
  logoUrl: string | null;
  canEdit: boolean;
}

export const fetchShopLink = () => api<ShopLink>("/api/app/store/handle");

export const changeShopHandle = (handle: string) => api<ShopLink>("/api/app/store/handle", { method: "PATCH", json: { handle } });

/** Error codes from PATCH that have their own words (shopLink "problem.<code>"). */
export const HANDLE_ERROR_CODES = ["short", "long", "start", "chars", "underscore", "reserved", "taken", "rate_limited"] as const;
