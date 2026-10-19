import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { encryptionConfigured, openSecret, sealSecret } from "@/lib/reviews/secrets";
import { appUrl } from "@/lib/reviews/server";
import { googleClient } from "@/lib/google/oauth";
import { parsePerformance, validSiteUrl, type SearchConsolePerformance } from "./pure";

// Search Console for a store: /home/analytics/traffic shows clicks, impressions, average position and top searches
// from Google. Normally filled by "Connect Google" (src/lib/google/connect.server.ts), which also adds and verifies
// the store; the older read-only sign-in below (webmasters.readonly) still works. Needs the Google client
// (GOOGLE_CLIENT_ID/SECRET, or the older GOOGLE_OAUTH_*) and INTEGRATIONS_ENCRYPTION_KEY (tokens stored encrypted).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://searchconsole.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export class SearchConsoleError extends Error {}

export function searchConsoleConfigured() {
  return Boolean(googleClient("searchConsole").id && googleClient("searchConsole").secret && encryptionConfigured());
}

export function searchConsoleRedirectUri() {
  return `${appUrl()}/api/app/search-console/callback`;
}

function stateSecret() {
  return googleClient("searchConsole").secret;
}

/** OAuth state: store id + nonce, signed so the callback only accepts a sign-in we started for this store. */
export function searchConsoleState(storeId: string) {
  const payload = `${storeId}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${createHmac("sha256", stateSecret()).update(payload).digest("base64url")}`;
}

export function readSearchConsoleState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3 || !stateSecret()) return null;
  const expected = Buffer.from(createHmac("sha256", stateSecret()).update(`${parts[0]}.${parts[1]}`).digest("base64url"));
  const given = Buffer.from(parts[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? parts[0] : null;
}

export function searchConsoleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: googleClient("searchConsole").id,
    redirect_uri: searchConsoleRedirectUri(),
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
    body: new URLSearchParams({ client_id: googleClient("searchConsole").id, client_secret: googleClient("searchConsole").secret, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) throw new SearchConsoleError(json.error_description || json.error || `Google sign-in failed (${res.status})`);
  return json;
}

export async function getSearchConsoleConnection(storeId: string) {
  return db.searchConsoleConnection.findUnique({ where: { storeId } }).catch(() => null);
}

export async function connectSearchConsole(storeId: string, code: string) {
  if (!encryptionConfigured()) throw new SearchConsoleError("Token encryption isn't set up.");
  const token = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: searchConsoleRedirectUri() });
  const existing = await getSearchConsoleConnection(storeId);
  const data = {
    accessToken: sealSecret(token.access_token),
    // Google only returns a refresh token on first consent; keep the one we have otherwise.
    refreshToken: token.refresh_token ? sealSecret(token.refresh_token) : (existing?.refreshToken ?? null),
    expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000),
    status: existing?.siteUrl ? "connected" : "needs_site",
    lastError: null,
  };
  await db.searchConsoleConnection.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
}

/** Tokens from "Connect Google" (src/lib/google/connect.server.ts): one sign-in fills this too. */
export async function saveSearchConsoleTokens(storeId: string, token: { access: string; refresh?: string; expiresAt: Date | null }) {
  const existing = await getSearchConsoleConnection(storeId);
  const data = {
    accessToken: sealSecret(token.access),
    refreshToken: token.refresh ? sealSecret(token.refresh) : (existing?.refreshToken ?? null),
    expiresAt: token.expiresAt ?? new Date(Date.now() + 3600_000),
    status: existing?.siteUrl ? "connected" : "needs_site",
    lastError: null,
  };
  await db.searchConsoleConnection.upsert({ where: { storeId }, create: { storeId, ...data }, update: data });
}

/** A fresh Google access token for this store (refreshed when needed); also used for Analytics and verification. */
export async function searchConsoleToken(storeId: string) {
  return (await accessToken(storeId)).token;
}

/** Sets the property without listing first (we just added and verified it ourselves). */
export async function setSearchConsoleSite(storeId: string, siteUrl: string) {
  const site = validSiteUrl(siteUrl);
  if (!site) throw new SearchConsoleError("That property isn't valid.");
  await db.searchConsoleConnection.update({ where: { storeId }, data: { siteUrl: site, status: "connected", lastError: null } });
}

async function accessToken(storeId: string) {
  const connection = await getSearchConsoleConnection(storeId);
  if (!connection) throw new SearchConsoleError("Google Search Console isn't connected.");
  const current = openSecret(connection.accessToken);
  if (current && connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) return { token: current, connection };
  const refresh = openSecret(connection.refreshToken);
  if (!refresh) throw new SearchConsoleError("Google sign-in expired. Connect Google again.");
  const fresh = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  await db.searchConsoleConnection.update({ where: { id: connection.id }, data: { accessToken: sealSecret(fresh.access_token), expiresAt: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000) } });
  return { token: fresh.access_token!, connection };
}

async function googleFetch(storeId: string, url: string, init: RequestInit = {}) {
  const { token } = await accessToken(storeId);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new SearchConsoleError((json.error as { message?: string } | undefined)?.message ?? `Google returned ${res.status}`);
  return json;
}

/** The properties this Google account can see. */
export async function listSearchConsoleSites(storeId: string): Promise<Array<{ siteUrl: string; permissionLevel?: string }>> {
  const json = await googleFetch(storeId, `${API}/sites`);
  return ((json.siteEntry ?? []) as Array<{ siteUrl?: string; permissionLevel?: string }>)
    .filter((site): site is { siteUrl: string; permissionLevel?: string } => typeof site.siteUrl === "string")
    .slice(0, 200);
}

export async function chooseSearchConsoleSite(storeId: string, siteUrl: string) {
  const site = validSiteUrl(siteUrl);
  if (!site) throw new SearchConsoleError("That property isn't valid.");
  // Only a property this Google account really has.
  const sites = await listSearchConsoleSites(storeId);
  if (!sites.some((entry) => entry.siteUrl === site)) throw new SearchConsoleError("That property isn't on this Google account.");
  await db.searchConsoleConnection.update({ where: { storeId }, data: { siteUrl: site, status: "connected", lastError: null } });
}

/** Clicks, impressions, position and top searches for the chosen property between two YYYY-MM-DD days. */
export async function searchConsolePerformance(storeId: string, fromDay: string, toDay: string): Promise<SearchConsolePerformance> {
  const connection = await getSearchConsoleConnection(storeId);
  if (!connection?.siteUrl) throw new SearchConsoleError("Choose your store's Search Console property first.");
  const url = `${API}/sites/${encodeURIComponent(connection.siteUrl)}/searchAnalytics/query`;
  const ask = (dimensions: string[], rowLimit: number) => googleFetch(storeId, url, { method: "POST", body: JSON.stringify({ startDate: fromDay, endDate: toDay, dimensions, rowLimit, dataState: "all" }) });
  try {
    const [totals, queries, pages] = await Promise.all([ask([], 1), ask(["query"], 15), ask(["page"], 10)]);
    if (connection.lastError) await db.searchConsoleConnection.update({ where: { id: connection.id }, data: { lastError: null } }).catch(() => undefined);
    return parsePerformance(totals, queries, pages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google didn't answer";
    await db.searchConsoleConnection.update({ where: { id: connection.id }, data: { lastError: message.slice(0, 300) } }).catch(() => undefined);
    throw error;
  }
}

export async function disconnectSearchConsole(storeId: string) {
  const connection = await getSearchConsoleConnection(storeId);
  if (!connection) return;
  const token = openSecret(connection.refreshToken) ?? openSecret(connection.accessToken);
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
  await db.searchConsoleConnection.delete({ where: { id: connection.id } });
}
