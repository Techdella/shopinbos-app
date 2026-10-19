import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/ads";
import { connectChannel, type ChannelView } from "@/lib/inbox/connect";
import { credentialKey, decryptJson, encryptJson } from "@/lib/inbox/crypto";
import { GRAPH_URL, GRAPH_VERSION } from "@/lib/inbox/channels/types";

// "Connect with Facebook" for the Messenger and Instagram cards on /home/inbox/channels: Facebook Login on Shopinbos's
// own Meta app (META_APP_ID + META_APP_SECRET), so sellers never touch a developer account or paste a token.
//   1. /api/app/inbox/meta/connect?channel=… sends them to Facebook with a signed state (+ nonce cookie).
//   2. /api/app/inbox/meta/callback swaps the code for a long-lived user token and lists their Pages. One Page (one
//      with Instagram linked, for Instagram): connected straight away with its Page token, which doesn't expire when
//      it comes from a long-lived user token. Several: the user token waits, encrypted, in a 15-minute httpOnly
//      cookie and the card asks which Page; /api/app/inbox/meta/pick finishes it.
// Either way connectChannel does the rest (checks the token, subscribes the Page to our webhook, saves it encrypted).
// META_INBOX_CONFIG_ID: the Facebook Login for Business configuration with those permissions.

export type MetaLoginChannel = "messenger" | "instagram";
export const META_LOGIN_CHANNELS: MetaLoginChannel[] = ["messenger", "instagram"];

// The configuration's permissions: pages_show_list, pages_messaging, pages_manage_metadata, business_management,
// instagram_basic, instagram_manage_messages (one configuration serves both cards).
const MAX_AGE_MS = 15 * 60_000;

export const META_LOGIN_NONCE_COOKIE = "sib_inbox_meta_n";
export const META_LOGIN_PENDING_COOKIE = "sib_inbox_meta_p";
export const META_LOGIN_MAX_AGE_S = MAX_AGE_MS / 1000;

export function isMetaLoginChannel(value: unknown): value is MetaLoginChannel {
  return value === "messenger" || value === "instagram";
}

// Business-type Meta apps refuse a login without a configuration ("config_id is required"), so this needs
// META_INBOX_CONFIG_ID; until it's set the cards offer the token form instead.
export function metaLoginConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.META_APP_ID?.trim() && env.META_APP_SECRET?.trim() && /^\d{5,25}$/.test(env.META_INBOX_CONFIG_ID?.trim() ?? "") && credentialKey(env));
}

const redirectUri = () => `${appOrigin()}/api/app/inbox/meta/callback`;

function sign(payload: string, key: Buffer) {
  return createHmac("sha256", key).update(`inbox-meta-state:${payload}`).digest("base64url");
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function startMetaLogin(storeId: string, channel: MetaLoginChannel): { url: string; nonce: string } | null {
  const key = credentialKey();
  if (!key || !metaLoginConfigured()) return null;
  const nonce = randomBytes(18).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ s: storeId, c: channel, n: nonce, t: Date.now() })).toString("base64url");
  const params = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: redirectUri(), state: `${payload}.${sign(payload, key)}`, response_type: "code" });
  params.set("config_id", process.env.META_INBOX_CONFIG_ID?.trim() ?? "");
  params.set("override_default_response_type", "true");
  return { url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`, nonce };
}

/** The channel the sign-in was for, when the state is ours, fresh, for this store and from this browser. */
export function readMetaLoginState(value: string | null, storeId: string, nonceCookie: string | null | undefined, now = Date.now()): MetaLoginChannel | null {
  const key = credentialKey();
  if (!key || !value || !nonceCookie || value.length > 1000) return null;
  const [payload, sig, extra] = value.split(".");
  if (!payload || !sig || extra !== undefined || !sameString(sign(payload, key), sig)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: string; c?: string; n?: string; t?: number };
    if (raw.s !== storeId || !isMetaLoginChannel(raw.c) || typeof raw.t !== "number" || now - raw.t > MAX_AGE_MS || raw.t > now + 60_000) return null;
    return sameString(raw.n ?? "", nonceCookie) ? raw.c : null;
  } catch {
    return null;
  }
}

// ─── Graph ─────────────────────────────────────────────────────────────────────

async function getJson(url: URL): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!res) return null;
  const json = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return res.ok && !json.error ? json : null;
}

async function exchangeCode(code: string): Promise<string | null> {
  const app = { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "" };
  const first = new URL(`${GRAPH_URL}/oauth/access_token`);
  for (const [k, v] of Object.entries({ ...app, redirect_uri: redirectUri(), code })) first.searchParams.set(k, v);
  const short = await getJson(first);
  if (typeof short?.access_token !== "string") return null;
  // A 60-day user token; Page tokens taken from it don't expire.
  const second = new URL(`${GRAPH_URL}/oauth/access_token`);
  for (const [k, v] of Object.entries({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })) second.searchParams.set(k, v);
  const long = await getJson(second);
  return typeof long?.access_token === "string" ? long.access_token : short.access_token;
}

interface Page {
  id: string;
  name: string;
  token: string;
  instagram: string | null;
}

async function listPages(userToken: string): Promise<Page[]> {
  const url = new URL(`${GRAPH_URL}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", userToken);
  const json = await getJson(url);
  const data = Array.isArray(json?.data) ? (json.data as Array<Record<string, unknown>>) : [];
  return data.flatMap((page) => {
    if (typeof page.id !== "string" || typeof page.access_token !== "string") return [];
    const ig = page.instagram_business_account as { id?: string; username?: string } | undefined;
    return [{ id: page.id, name: typeof page.name === "string" ? page.name : "Facebook Page", token: page.access_token, instagram: ig?.id ? (ig.username ? `@${ig.username}` : "Instagram account") : null }];
  });
}

const eligible = (pages: Page[], channel: MetaLoginChannel) => (channel === "instagram" ? pages.filter((page) => page.instagram) : pages);

// ─── Finish ────────────────────────────────────────────────────────────────────

export type MetaLoginOutcome =
  | { kind: "connected" }
  | { kind: "pick"; pending: string }
  | { kind: "no_page" | "no_instagram" | "taken" | "problem"; message?: string };

type Store = { id: string; slug: string };

export async function finishMetaLogin(store: Store, channel: MetaLoginChannel, code: string): Promise<MetaLoginOutcome> {
  const token = await exchangeCode(code);
  if (!token) return { kind: "problem" };
  const pages = await listPages(token);
  const choices = eligible(pages, channel);
  if (choices.length === 0) return { kind: channel === "instagram" && pages.length > 0 ? "no_instagram" : "no_page" };
  if (choices.length === 1) {
    const result = await connectChannel(store, channel, { pageAccessToken: choices[0].token });
    if (result.ok) return { kind: "connected" };
    return { kind: /another store/i.test(result.error) ? "taken" : "problem", message: result.error };
  }
  return { kind: "pick", pending: encryptJson({ s: store.id, c: channel, token, t: Date.now() }) };
}

function readPending(cookie: string | null | undefined, storeId: string, now = Date.now()) {
  const raw = decryptJson<{ s?: string; c?: string; token?: string; t?: number }>(cookie);
  if (!raw || raw.s !== storeId || !isMetaLoginChannel(raw.c) || typeof raw.token !== "string" || typeof raw.t !== "number" || now - raw.t > MAX_AGE_MS) return null;
  return { channel: raw.c, token: raw.token };
}

export interface PageChoice {
  id: string;
  name: string;
  instagram: string | null;
}

/** For the channels page: the Pages to choose from after a sign-in that found several. No tokens. */
export async function pendingChoices(cookie: string | null | undefined, storeId: string): Promise<{ channel: MetaLoginChannel; pages: PageChoice[] } | null> {
  const pending = readPending(cookie, storeId);
  if (!pending) return null;
  const pages = eligible(await listPages(pending.token), pending.channel);
  return pages.length ? { channel: pending.channel, pages: pages.map(({ id, name, instagram }) => ({ id, name, instagram })) } : null;
}

export async function pickPage(store: Store, cookie: string | null | undefined, channel: MetaLoginChannel, pageId: string): Promise<{ ok: true; view: ChannelView } | { ok: false; error: string }> {
  const pending = readPending(cookie, store.id);
  if (!pending || pending.channel !== channel) return { ok: false, error: "That sign-in has expired. Tap Connect with Facebook again." };
  const page = eligible(await listPages(pending.token), channel).find((item) => item.id === pageId);
  if (!page) return { ok: false, error: "We couldn't find that Page on your Facebook account. Tap Connect with Facebook again." };
  return connectChannel(store, channel, { pageAccessToken: page.token });
}
