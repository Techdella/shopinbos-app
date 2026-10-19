// Signed campaign preview links: /?preview_campaign=<id>&token=<signed> shows the store as if the campaign were live,
// to anyone holding the link, until it expires (7 days by default). The token names the campaign and the store and
// is signed with a server secret (HMAC-SHA256), so it can't be made up or moved to another campaign or store.
// Pure apart from node:crypto; the secret is passed in (previewSecret() in the server module). Server only.

import { createHmac, timingSafeEqual } from "node:crypto";

export { PREVIEW_AT_PARAM, PREVIEW_COOKIE, PREVIEW_PARAM, PREVIEW_TOKEN_PARAM, previewParamsFromPath, readPreviewAt } from "./preview-params.ts";

export const PREVIEW_TOKEN_DAYS = 7;

export interface PreviewPayload {
  /** Campaign id. */
  c: string;
  /** Store id. */
  s: string;
  /** Expires at (ms). */
  e: number;
}

function mac(body: string, secret: string) {
  return createHmac("sha256", `campaign-preview:${secret}`).update(body).digest("base64url");
}

export function signPreviewToken(input: { campaignId: string; storeId: string; expiresAt?: number }, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("No preview secret configured");
  const payload: PreviewPayload = { c: input.campaignId, s: input.storeId, e: input.expiresAt ?? now + PREVIEW_TOKEN_DAYS * 86_400_000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

/** The payload when the token is genuine, unexpired and (when given) for this campaign; null otherwise. */
export function verifyPreviewToken(token: unknown, secret: string, options: { now?: number; campaignId?: string | null } = {}): PreviewPayload | null {
  if (!secret || typeof token !== "string" || token.length > 600) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let payload: PreviewPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload.c !== "string" || typeof payload.s !== "string" || typeof payload.e !== "number") return null;
  if (payload.e <= (options.now ?? Date.now())) return null;
  if (options.campaignId && options.campaignId !== payload.c) return null;
  return payload;
}
