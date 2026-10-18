import "server-only";

import { db } from "@/lib/db/client";
import { decryptJson } from "@/lib/inbox/crypto";
import { readTokens } from "@/lib/sales-channels/pure";
import { debugToken } from "@/lib/whatsapp-catalog/graph";

// Which Facebook person connected which store through our Meta app. Meta's Deauthorize and Data Deletion callbacks
// (src/app/api/webhooks/meta/{deauthorize,data-deletion}) name the person only by their app-scoped user ID, so every
// place that saves a Meta token records it here (src/lib/meta/user-data.server.ts acts on it).

export type MetaLinkSource = "inbox_whatsapp" | "inbox_messenger" | "inbox_instagram" | "sales_meta" | "meta_ads";

/**
 * Looks up whose token this is (debug_token) and records the link. Only tokens issued to our app count: a token
 * from the seller's own Meta app is theirs to manage. Never throws; a connection must not fail over this.
 */
export async function recordMetaUser(storeId: string, source: MetaLinkSource, accessToken: string) {
  try {
    const info = await debugToken(accessToken);
    const appId = process.env.META_APP_ID?.trim();
    const userId = info?.user_id == null ? "" : String(info.user_id);
    if (!info || !appId || String(info.app_id ?? "") !== appId || !/^\d{1,32}$/.test(userId)) return;
    await db.metaUserLink.upsert({
      where: { metaUserId_storeId_source: { metaUserId: userId, storeId, source } },
      create: { metaUserId: userId, storeId, source },
      update: {},
    });
  } catch (error) {
    console.warn(`[meta] couldn't record who connected ${source}`, error);
  }
}

/**
 * Links the connections made before links were recorded (scripts/backfill-meta-user-links.ts runs it once).
 * Tokens that no longer work can't be looked up; those people can't be matched until they connect again.
 */
export async function backfillMetaUserLinks() {
  let checked = 0;

  const inbox = await db.inboxChannel.findMany({
    where: { channel: { in: ["whatsapp", "messenger", "instagram"] }, status: "connected", credentials: { not: null } },
    select: { storeId: true, channel: true, credentials: true },
  });
  for (const row of inbox) {
    const credentials = decryptJson<Record<string, string>>(row.credentials);
    const token = row.channel === "whatsapp" ? credentials?.accessToken : credentials?.pageAccessToken;
    if (!token) continue;
    await recordMetaUser(row.storeId, `inbox_${row.channel}` as MetaLinkSource, token);
    checked += 1;
  }

  const social = await db.socialChannelConnection.findMany({
    where: { channel: { in: ["meta", "meta_ads"] }, tokenEnc: { not: null } },
    select: { storeId: true, channel: true, tokenEnc: true },
  });
  for (const row of social) {
    const token = readTokens(decryptJson(row.tokenEnc))?.token;
    if (!token) continue;
    await recordMetaUser(row.storeId, row.channel === "meta" ? "sales_meta" : "meta_ads", token);
    checked += 1;
  }

  const linked = await db.metaUserLink.count();
  return { checked, linked };
}
