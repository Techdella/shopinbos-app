import "server-only";

import { db } from "@/lib/db/client";
import { connectChannel, disconnectChannel } from "@/lib/inbox/connect";
import { debugToken, graph } from "@/lib/whatsapp-catalog/graph";
import { grantedTargets } from "@/lib/whatsapp-catalog/pure";
import { setStoreIntegration } from "@/lib/storefront/integrations.server";

// One "Connect Facebook & Instagram" for everything Meta: after the sign-in on /channels, the seller's Facebook
// Page and the Instagram account linked to it are connected to the inbox too, with the Page's own token (never
// pasted, never shown). Rows connected this way are marked via "facebook_login"; Disconnect on the card turns off the
// Page and Instagram messages however they were connected, since the card shows them.

export const VIA_FACEBOOK_LOGIN = "facebook_login";

interface Page {
  id: string;
  name: string;
  token: string;
  instagram: boolean;
}

function readPage(value: unknown): Page | null {
  const raw = (value ?? {}) as { id?: unknown; name?: unknown; access_token?: unknown; instagram_business_account?: { id?: unknown } };
  if (typeof raw.id !== "string" || typeof raw.access_token !== "string") return null;
  return { id: raw.id, name: typeof raw.name === "string" ? raw.name : "Facebook Page", token: raw.access_token, instagram: typeof raw.instagram_business_account?.id === "string" };
}

const PAGE_FIELDS = "id,name,access_token,instagram_business_account{id}";

/** The Pages the seller ticked in the sign-in, each with its Page token. */
async function pagesFor(userToken: string): Promise<Page[]> {
  const listed = await graph("me/accounts", userToken, { query: { fields: PAGE_FIELDS, limit: "25" } });
  const pages = listed.ok && Array.isArray(listed.json.data) ? listed.json.data.map(readPage).filter((page): page is Page => Boolean(page)) : [];
  if (pages.length) return pages;
  // Business (system-user) tokens don't list /me/accounts; the granted Page ids are on the token instead.
  const info = await debugToken(userToken);
  const ids = [...new Set([...grantedTargets(info, "pages_messaging"), ...grantedTargets(info, "pages_show_list")])].slice(0, 10);
  const found: Page[] = [];
  for (const id of ids) {
    const page = await graph(encodeURIComponent(id), userToken, { query: { fields: PAGE_FIELDS } });
    const read = page.ok ? readPage(page.json) : null;
    if (read) found.push(read);
  }
  return found;
}

export interface MetaInboxResult {
  messenger: boolean;
  instagram: boolean;
}

/** Connects Messenger and Instagram messages for the store from a fresh Facebook sign-in. Never throws. */
export async function connectMetaInbox(store: { id: string; slug: string }, userToken: string): Promise<MetaInboxResult> {
  const result: MetaInboxResult = { messenger: false, instagram: false };
  try {
    const pages = await pagesFor(userToken);
    if (!pages.length) return result;
    // Keep the Page they used before; otherwise prefer one with Instagram linked, so both connect in one go.
    const current = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "messenger" } }, select: { externalId: true } });
    const page = pages.find((item) => item.id === current?.externalId) ?? pages.find((item) => item.instagram) ?? pages[0];
    for (const channel of ["messenger", "instagram"] as const) {
      if (channel === "instagram" && !page.instagram) continue;
      const connected = await connectChannel(store, channel, { pageAccessToken: page.token });
      if (!connected.ok) {
        console.error(`[sales-channels] ${channel} inbox connect failed`, connected.error.slice(0, 200));
        continue;
      }
      result[channel] = true;
      const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel } }, select: { id: true, settings: true } });
      if (row) await db.inboxChannel.update({ where: { id: row.id }, data: { settings: { ...((row.settings as object | null) ?? {}), via: VIA_FACEBOOK_LOGIN } } });
    }
  } catch (error) {
    console.error("[sales-channels] meta inbox connect failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  }
  return result;
}

/**
 * Disconnect on the Facebook & Instagram card: the Page's and Instagram's messages stop too. The card lists those
 * accounts however they were connected (here or in Inbox → Channels), so Disconnect turns off all of them.
 */
export async function disconnectMetaInbox(storeId: string) {
  const rows = await db.inboxChannel.findMany({ where: { storeId, channel: { in: ["messenger", "instagram"] }, status: "connected" }, select: { channel: true } });
  for (const row of rows) await disconnectChannel(storeId, row.channel as "messenger" | "instagram");
}

/**
 * The store's Facebook pixel (visitor and ads stats on the store), found or made in the business the catalog uses,
 * so nobody pastes a pixel ID. Never replaces one already set; never throws.
 */
export async function pickMetaPixel(storeId: string, businessId: string, token: string) {
  try {
    const listed = await graph(`${encodeURIComponent(businessId)}/adspixels`, token, { query: { fields: "id,name", limit: "25" } });
    const pixels = listed.ok && Array.isArray(listed.json.data) ? (listed.json.data as Array<{ id?: unknown }>) : [];
    let pixelId = pixels.map((item) => item.id).find((id): id is string => typeof id === "string") ?? null;
    if (!pixelId) {
      const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true } });
      const created = await graph(`${encodeURIComponent(businessId)}/adspixels`, token, { body: { name: `${(store?.name ?? "My shop").slice(0, 60)} (Shopinbos)` } });
      pixelId = created.ok && typeof created.json.id === "string" ? created.json.id : null;
    }
    if (pixelId) await setStoreIntegration(storeId, "metaPixelId", pixelId, { onlyIfEmpty: true });
  } catch (error) {
    console.error("[sales-channels] meta pixel failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  }
}
