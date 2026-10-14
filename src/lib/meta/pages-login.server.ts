import "server-only";

import { db } from "@/lib/db/client";
import { connectMetaPage } from "@/lib/inbox/connect";
import { decryptJson, encryptJson, hasCredentialKey } from "@/lib/inbox/crypto";
import { GRAPH_URL, providerError, readJson } from "@/lib/inbox/channels/types";

// "Connect with Facebook" for Pages and Instagram (Facebook Login for Business, configuration META_PAGES_CONFIG_ID).
// The browser gets a 30-second code from FB.login; we swap it for the seller's user token, list their Pages, and
// hand back the list with that token sealed (encrypted, 15 minutes, tied to the store) so the token never reaches
// the browser. Picking a Page then connects Messenger and Instagram DMs to the inbox and saves the Page and
// Instagram account for the post scheduler. Page tokens fetched with a long-lived user token don't expire.

const SESSION_MINUTES = 15;

export interface PageChoice {
  id: string;
  name: string;
  instagram: { id: string; username: string | null } | null;
  /** The seller's role on the Page lets them message and publish (Facebook's MODERATE / CREATE_CONTENT tasks). */
  canMessage: boolean;
  canPublish: boolean;
}

interface RawPage {
  id?: string;
  name?: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: { id?: string; username?: string };
}

export function pagesLoginConfig(): { appId: string; configId: string } | null {
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_PAGES_CONFIG_ID;
  return appId && configId && process.env.META_APP_SECRET ? { appId, configId } : null;
}

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH_URL}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false as const, error: "Couldn't reach Facebook. Try again." };
  const json = await readJson(res);
  return res.ok ? { ok: true as const, json } : { ok: false as const, error: providerError(json, "Facebook didn't accept the request.") };
}

/** Code → user token, made long-lived where Facebook allows it (so the Page tokens don't expire). */
async function userTokenFromCode(code: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID!;
  const secret = process.env.META_APP_SECRET!;
  const base = `${GRAPH_URL}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(secret)}`;
  const res = await fetch(`${base}&code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(15_000) }).catch((error: Error) => error);
  if (res instanceof Error) return { ok: false, error: "Couldn't reach Facebook to finish signing in. Try again." };
  const json = await readJson(res);
  if (!res.ok || typeof json.access_token !== "string") return { ok: false, error: providerError(json, "Facebook didn't accept the sign-in. Start again.") };
  const long = await fetch(`${base}&grant_type=fb_exchange_token&fb_exchange_token=${encodeURIComponent(json.access_token)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const longJson = long?.ok ? await readJson(long) : {};
  return { ok: true, token: typeof longJson.access_token === "string" ? longJson.access_token : json.access_token };
}

async function listRawPages(userToken: string): Promise<{ ok: true; pages: RawPage[] } | { ok: false; error: string }> {
  const fields = "id,name,access_token,tasks,instagram_business_account{id,username}";
  const result = await graphGet(`/me/accounts?fields=${encodeURIComponent(fields)}&limit=100`, userToken);
  if (!result.ok) return result;
  return { ok: true, pages: Array.isArray(result.json.data) ? (result.json.data as RawPage[]) : [] };
}

function choiceOf(page: RawPage): PageChoice {
  const tasks = page.tasks ?? [];
  const ig = page.instagram_business_account;
  return {
    id: String(page.id),
    name: String(page.name ?? "Facebook Page"),
    instagram: ig?.id ? { id: ig.id, username: ig.username ?? null } : null,
    canMessage: tasks.length === 0 || tasks.includes("MODERATE") || tasks.includes("MANAGE"),
    canPublish: tasks.length === 0 || tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE"),
  };
}

function seal(storeId: string, token: string) {
  return encryptJson({ s: storeId, t: token, e: Date.now() + SESSION_MINUTES * 60_000 });
}

function unseal(storeId: string, session: string): string | null {
  const value = decryptJson<{ s?: string; t?: string; e?: number }>(session);
  if (!value?.t || value.s !== storeId || !value.e || value.e < Date.now()) return null;
  return value.t;
}

/** Step 1: the code from the popup → the seller's Pages, and a sealed session for step 2. */
export async function startPagesLogin(storeId: string, code: string): Promise<{ ok: true; session: string; pages: PageChoice[] } | { ok: false; error: string }> {
  if (!pagesLoginConfig()) return { ok: false, error: "Connect with Facebook isn't set up on this server yet (META_APP_ID, META_APP_SECRET, META_PAGES_CONFIG_ID)." };
  if (!hasCredentialKey()) return { ok: false, error: "This server can't store channel keys safely yet (INBOX_ENCRYPTION_KEY isn't set). Ask your Shopinbos admin." };
  const user = await userTokenFromCode(code);
  if (!user.ok) return user;
  const list = await listRawPages(user.token);
  if (!list.ok) return list;
  const pages = list.pages.filter((p) => p.id && p.access_token).map(choiceOf);
  if (!pages.length) return { ok: false, error: "No Facebook Pages came back. Sign in again and tick your Page (and its Instagram account) when Facebook asks." };
  return { ok: true, session: seal(storeId, user.token), pages };
}

export interface PagePick {
  session: string;
  pageId: string;
  messenger: boolean;
  instagramDms: boolean;
  publishing: boolean;
}

export interface PageConnectResult {
  messenger?: { ok: boolean; error?: string };
  instagram?: { ok: boolean; error?: string };
  publishing?: { ok: boolean; error?: string; platforms?: string[] };
}

/** Step 2: connect the chosen Page to the inbox and/or the scheduler. */
export async function finishPagesLogin(storeId: string, pick: PagePick): Promise<{ ok: true; result: PageConnectResult } | { ok: false; error: string }> {
  const userToken = unseal(storeId, pick.session);
  if (!userToken) return { ok: false, error: "That sign-in has expired. Click Connect with Facebook again." };
  const list = await listRawPages(userToken);
  if (!list.ok) return list;
  const page = list.pages.find((p) => String(p.id) === pick.pageId);
  if (!page?.access_token) return { ok: false, error: "That Page isn't available any more. Sign in again and tick it when Facebook asks." };
  const choice = choiceOf(page);
  const pageToken = page.access_token;
  const result: PageConnectResult = {};

  if (pick.messenger) {
    const done = await connectMetaPage({ id: storeId }, "messenger", pageToken);
    result.messenger = done.ok ? { ok: true } : { ok: false, error: done.error };
  }
  if (pick.instagramDms) {
    if (!choice.instagram) result.instagram = { ok: false, error: "This Page has no Instagram professional account linked. Link one in Meta Business Suite first." };
    else {
      const done = await connectMetaPage({ id: storeId }, "instagram", pageToken);
      result.instagram = done.ok ? { ok: true } : { ok: false, error: done.error };
    }
  }
  if (pick.publishing) {
    const tokenEnc = encryptJson({ pageAccessToken: pageToken });
    const platforms: string[] = [];
    const save = (platform: "facebook" | "instagram", externalId: string, name: string) =>
      db.socialAccount.upsert({
        where: { storeId_platform: { storeId, platform } },
        create: { storeId, platform, externalId, pageId: choice.id, name, tokenEnc },
        update: { externalId, pageId: choice.id, name, tokenEnc, status: "connected", lastError: null, connectedAt: new Date() },
      });
    await save("facebook", choice.id, choice.name);
    platforms.push("facebook");
    if (choice.instagram) {
      await save("instagram", choice.instagram.id, choice.instagram.username ? `@${choice.instagram.username}` : "Instagram account");
      platforms.push("instagram");
    }
    result.publishing = { ok: true, platforms };
  }
  return { ok: true, result };
}
