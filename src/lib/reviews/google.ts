import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { googleClient } from "@/lib/google/oauth";
import { googleReviewToRow } from "./pure";
import { openSecret, sealSecret } from "./secrets";
import { appUrl } from "./server";

// Google Business Profile: OAuth (business.manage scope), choose a location, import its reviews and post
// replies. Needs GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET from a Google Cloud project
// that Google has approved for the Business Profile APIs. Redirect URI to register:
// {NEXT_PUBLIC_APP_URL}/api/app/reviews/google/callback

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_URL = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_URL = "https://mybusiness.googleapis.com/v4";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
const PROVIDER = "google_business";

export class GoogleReviewsError extends Error {}

export function googleConfigured() {
  return Boolean(googleClient("business").id && googleClient("business").secret);
}

export function googleRedirectUri() {
  return `${appUrl()}/api/app/reviews/google/callback`;
}

function stateSecret() {
  return googleClient("business").secret;
}

/** OAuth state: store id + nonce, signed so the callback only accepts what we started. */
export function googleState(storeId: string) {
  const payload = `${storeId}.${randomBytes(12).toString("base64url")}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readGoogleState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const expected = Buffer.from(createHmac("sha256", stateSecret()).update(`${parts[0]}.${parts[1]}`).digest("base64url"));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? parts[0] : null;
}

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: googleClient("business").id,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClient("business").id, client_secret: googleClient("business").secret, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new GoogleReviewsError(json.error_description || json.error || `Google sign-in failed (${res.status})`);
  return json;
}

export async function connectGoogle(storeId: string, code: string) {
  const token = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
  const existing = await db.reviewSourceConnection.findUnique({ where: { storeId_provider: { storeId, provider: PROVIDER } } });
  const data = {
    accessToken: sealSecret(token.access_token),
    // Google only returns a refresh token on first consent; keep the one we have otherwise.
    refreshToken: token.refresh_token ? sealSecret(token.refresh_token) : (existing?.refreshToken ?? null),
    expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    status: "needs_location",
    lastError: null,
  };
  await db.reviewSourceConnection.upsert({
    where: { storeId_provider: { storeId, provider: PROVIDER } },
    create: { storeId, provider: PROVIDER, ...data },
    update: data,
  });
}

/** Tokens from "Connect Google" (src/lib/google/connect.server.ts): one sign-in fills this too. */
export async function saveGoogleReviewTokens(storeId: string, token: { access: string; refresh?: string; expiresAt: Date | null }) {
  const existing = await db.reviewSourceConnection.findUnique({ where: { storeId_provider: { storeId, provider: PROVIDER } } });
  const data = {
    accessToken: sealSecret(token.access),
    refreshToken: token.refresh ? sealSecret(token.refresh) : (existing?.refreshToken ?? null),
    expiresAt: token.expiresAt ?? new Date(Date.now() + 3600_000),
    status: existing?.locationName ? "connected" : "needs_location",
    lastError: null,
  };
  await db.reviewSourceConnection.upsert({ where: { storeId_provider: { storeId, provider: PROVIDER } }, create: { storeId, provider: PROVIDER, ...data }, update: data });
}

export async function getGoogleConnection(storeId: string) {
  return db.reviewSourceConnection.findUnique({ where: { storeId_provider: { storeId, provider: PROVIDER } } }).catch(() => null);
}

async function accessToken(storeId: string) {
  const connection = await getGoogleConnection(storeId);
  if (!connection) throw new GoogleReviewsError("Google Business Profile isn't connected.");
  const current = openSecret(connection.accessToken);
  if (current && connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) return { token: current, connection };
  const refresh = openSecret(connection.refreshToken);
  if (!refresh) throw new GoogleReviewsError("Google sign-in expired. Connect Google again.");
  const fresh = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  await db.reviewSourceConnection.update({
    where: { id: connection.id },
    data: { accessToken: sealSecret(fresh.access_token), expiresAt: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000) },
  });
  return { token: fresh.access_token!, connection };
}

async function googleFetch(storeId: string, url: string, init: RequestInit = {}) {
  const { token } = await accessToken(storeId);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (json.error as { message?: string } | undefined)?.message ?? `Google returned ${res.status}`;
    throw new GoogleReviewsError(message);
  }
  return json;
}

export interface GoogleLocation {
  accountName: string;
  locationName: string;
  title: string;
  address: string;
}

export async function listGoogleLocations(storeId: string): Promise<GoogleLocation[]> {
  const accounts = ((await googleFetch(storeId, ACCOUNTS_URL)).accounts ?? []) as Array<{ name: string }>;
  const locations: GoogleLocation[] = [];
  for (const account of accounts.slice(0, 10)) {
    const page = await googleFetch(storeId, `${INFO_URL}/${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`);
    for (const location of (page.locations ?? []) as Array<{ name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }>) {
      const address = [...(location.storefrontAddress?.addressLines ?? []), location.storefrontAddress?.locality].filter(Boolean).join(", ");
      locations.push({ accountName: account.name, locationName: location.name, title: location.title ?? location.name, address });
    }
  }
  return locations;
}

export async function chooseGoogleLocation(storeId: string, location: { accountName: string; locationName: string; title: string }) {
  if (!/^accounts\/[\w-]+$/.test(location.accountName) || !/^locations\/[\w-]+$/.test(location.locationName)) throw new GoogleReviewsError("That location isn't valid.");
  await db.reviewSourceConnection.update({
    where: { storeId_provider: { storeId, provider: PROVIDER } },
    data: { accountName: location.accountName, locationName: location.locationName, locationTitle: location.title.slice(0, 200), status: "connected", lastError: null },
  });
}

/** Imports (or refreshes) every review on the chosen location. Returns how many were new. */
export async function syncGoogleReviews(storeId: string) {
  const connection = await getGoogleConnection(storeId);
  if (!connection?.accountName || !connection.locationName) throw new GoogleReviewsError("Choose which Google location to import first.");
  const base = `${REVIEWS_URL}/${connection.accountName}/${connection.locationName}/reviews`;
  let pageToken = "";
  let added = 0;
  let seen = 0;
  try {
    for (let page = 0; page < 20; page++) {
      const json = await googleFetch(storeId, `${base}?pageSize=50${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      for (const raw of (json.reviews ?? []) as Array<Record<string, unknown>>) {
        const row = googleReviewToRow(raw);
        if (!row) continue;
        seen++;
        const existing = await db.externalReview.findUnique({ where: { storeId_source_externalId: { storeId, source: "google", externalId: row.externalId } }, select: { id: true } });
        const fromGoogle = { authorName: row.authorName, authorPhotoUrl: row.authorPhotoUrl, rating: row.rating, body: row.body, reviewedAt: row.reviewedAt, reply: row.reply, repliedAt: row.repliedAt, replySyncedAt: row.reply ? new Date() : null };
        if (existing) {
          // Google is the source of truth for the text and the reply; moderation and features stay ours.
          await db.externalReview.update({ where: { id: existing.id }, data: fromGoogle });
        } else {
          await db.externalReview.create({ data: { storeId, source: "google", importMethod: "api", externalId: row.externalId, status: "approved", ...fromGoogle } });
          added++;
        }
      }
      pageToken = typeof json.nextPageToken === "string" ? json.nextPageToken : "";
      if (!pageToken) break;
    }
    await db.reviewSourceConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), lastError: null, status: "connected" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    await db.reviewSourceConnection.update({ where: { id: connection.id }, data: { lastError: message.slice(0, 300) } }).catch(() => undefined);
    throw error;
  }
  return { added, seen };
}

/** Posts (or replaces) the reply on Google. Empty text deletes it. */
export async function replyOnGoogle(storeId: string, reviewName: string, comment: string) {
  if (!/^accounts\/[\w-]+\/locations\/[\w-]+\/reviews\/[\w-]+$/.test(reviewName)) throw new GoogleReviewsError("This review has no Google id.");
  if (comment.trim()) await googleFetch(storeId, `${REVIEWS_URL}/${reviewName}/reply`, { method: "PUT", body: JSON.stringify({ comment: comment.trim() }) });
  else await googleFetch(storeId, `${REVIEWS_URL}/${reviewName}/reply`, { method: "DELETE" });
}

export async function disconnectGoogle(storeId: string) {
  const connection = await getGoogleConnection(storeId);
  if (!connection) return;
  const token = openSecret(connection.refreshToken) ?? openSecret(connection.accessToken);
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
  await db.reviewSourceConnection.delete({ where: { id: connection.id } });
}
