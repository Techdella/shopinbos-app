import "server-only";

import { GRAPH_VERSION } from "@/lib/inbox/channels/types";
import { parseGraphError, type GraphError } from "./pure";

// A tiny Graph API client for the catalog sync. Same Graph version as the WhatsApp inbox (inbox/channels/types.ts).
// The token goes in the Authorization header, never in the URL, so it can't end up in access logs; nothing here
// logs request URLs, bodies or tokens.
//
// META_GRAPH_BASE_URL (testing only) points the catalog calls at a local stub instead of graph.facebook.com.

export function graphBase() {
  const base = (process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com").replace(/\/$/, "");
  return `${base}/${GRAPH_VERSION}`;
}

export type GraphResult = { ok: true; status: number; json: Record<string, unknown> } | { ok: false; status: number; json: Record<string, unknown>; error: GraphError };

export async function graph(
  path: string,
  token: string,
  options: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<GraphResult> {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    cache: "no-store",
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, json: {}, error: { kind: "rate_limit", code: null, subcode: null, message: "Couldn't reach Meta. The sync will try again shortly." } };
  const json = ((await response.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!response.ok || json.error) return { ok: false, status: response.status, json, error: parseGraphError(json, response.status) };
  return { ok: true, status: response.status, json };
}

/** debug_token needs an access_token query parameter (Meta's design); the app token is used when configured. */
export async function debugToken(token: string): Promise<Record<string, unknown> | null> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const inspector = appId && appSecret ? `${appId}|${appSecret}` : token;
  const url = new URL(`${graphBase()}/debug_token`);
  url.searchParams.set("input_token", token);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${inspector}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return null;
  const json = ((await response.json().catch(() => null)) ?? {}) as { data?: Record<string, unknown> };
  return json.data ?? null;
}

/**
 * Subscribes (or, with remove, unsubscribes) our app to the catalog's webhooks (items_batch, product_feed), which
 * then arrive at /api/webhooks/meta-catalog. Needs catalog_management and edit access to the catalog. Best effort:
 * the sync works without it (it polls batch results itself), so a failure only returns false.
 */
export async function setCatalogSubscription(catalogId: string, token: string, remove = false): Promise<boolean> {
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) return false;
  const res = await graph(`${encodeURIComponent(catalogId)}/subscribed_apps`, token, remove ? { method: "DELETE", query: { app_id: appId } } : { body: { app_id: appId } });
  return res.ok;
}
