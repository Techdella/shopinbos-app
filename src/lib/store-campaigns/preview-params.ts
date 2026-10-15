// The query parameters and cookie of campaign preview links (no crypto, so browser code can use them too).
// Signing and checking the token is preview-token.ts (server only).

export const PREVIEW_PARAM = "preview_campaign";
export const PREVIEW_TOKEN_PARAM = "token";
/** Optional "preview at time": an ISO time or ms the storefront pretends it is (timers, ending soon). */
export const PREVIEW_AT_PARAM = "preview_at";
/** Cookie that keeps a preview going while the previewer clicks around the store. */
export const PREVIEW_COOKIE = "sib_campaign_preview";

/** A "preview at" value from a link (ISO or ms), within ±1 year of now; null when absent or silly. */
export function readPreviewAt(value: unknown, now = Date.now()): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const ms = /^\d{10,14}$/.test(raw) ? Number(raw) : Date.parse(raw);
  if (!Number.isFinite(ms) || Math.abs(ms - now) > 366 * 86_400_000) return null;
  return ms;
}

/** Reads preview_campaign / token / preview_at from a path with a query ("/shop?preview_campaign=…"). */
export function previewParamsFromPath(pathWithQuery: string | null | undefined): { campaignId: string; token: string; at: string | null } | null {
  if (!pathWithQuery) return null;
  const query = pathWithQuery.includes("?") ? pathWithQuery.slice(pathWithQuery.indexOf("?") + 1) : "";
  if (!query) return null;
  const params = new URLSearchParams(query);
  const campaignId = params.get(PREVIEW_PARAM);
  const token = params.get(PREVIEW_TOKEN_PARAM);
  if (!campaignId || !token) return null;
  return { campaignId, token, at: params.get(PREVIEW_AT_PARAM) };
}
