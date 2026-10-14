"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { decryptJson, encryptJson, hasCredentialKey } from "@/lib/inbox/crypto";
import { FEED_CHANNELS, type FeedChannel } from "@/lib/social/feeds";
import { pushMetaCatalog, verifyMetaCatalog } from "@/lib/social/server";
import { plainMetaError } from "@/components/simple/plain";
import { getT } from "@/lib/i18n/server";

// Social selling actions for /channels. Tokens are encrypted at rest (src/lib/inbox/crypto.ts, INBOX_ENCRYPTION_KEY)
// and never sent back to the browser.

export interface ChannelActionState {
  ok?: boolean;
  message?: string;
}

async function sellerStore() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") return null;
  return db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true } });
}

const channelSchema = z.enum(FEED_CHANNELS);

/** The seller says they pasted the feed URL into the channel (or takes that back). */
export async function setFeedAdded(formData: FormData) {
  const store = await sellerStore();
  const channel = channelSchema.safeParse(formData.get("channel"));
  if (!store || !channel.success) return;
  const added = formData.get("added") === "1";
  const data = { feedAddedAt: added ? new Date() : null };
  await db.socialChannelConnection.upsert({
    where: { storeId_channel: { storeId: store.id, channel: channel.data } },
    create: { storeId: store.id, channel: channel.data, ...data },
    update: data,
  });
  revalidatePath("/channels");
}

const metaSchema = z.object({
  channel: z.enum(["meta", "whatsapp"]),
  catalogId: z.string().trim().regex(/^\d{5,25}$/, "act.badId"),
  token: z.string().trim().min(20, "act.badToken").max(1000),
});

/** Connects a Meta catalog for API sync after checking the ID and token can see it. */
export async function connectMetaCatalog(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  const store = await sellerStore();
  const t = await getT("social");
  if (!store) return { message: t("act.signIn") };
  if (!hasCredentialKey()) return { message: t("meta.off") };
  const parsed = metaSchema.safeParse({ channel: formData.get("channel"), catalogId: formData.get("catalogId"), token: formData.get("token") });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message;
    return { message: issue === "act.badId" || issue === "act.badToken" ? t(issue) : t("act.checkIds") };
  }

  let name: string;
  try {
    name = await verifyMetaCatalog(parsed.data.catalogId, parsed.data.token);
  } catch (error) {
    const raw = error instanceof Error ? error.message : "unknown error";
    return { message: t("act.facebookSaid", { plain: plainMetaError(raw), raw }) };
  }
  const data = { externalId: parsed.data.catalogId, tokenEnc: encryptJson({ token: parsed.data.token }), lastSyncStatus: null, lastSyncMessage: `Connected to “${name}”` };
  await db.socialChannelConnection.upsert({
    where: { storeId_channel: { storeId: store.id, channel: parsed.data.channel } },
    create: { storeId: store.id, channel: parsed.data.channel, ...data },
    update: data,
  });
  revalidatePath("/channels");
  return { ok: true, message: t("act.connected", { name }) };
}

export async function disconnectChannel(formData: FormData) {
  const store = await sellerStore();
  const channel = channelSchema.safeParse(formData.get("channel"));
  if (!store || !channel.success) return;
  await db.socialChannelConnection.updateMany({
    where: { storeId: store.id, channel: channel.data },
    data: { externalId: null, tokenEnc: null, lastSyncAt: null, lastSyncStatus: null, lastSyncMessage: null },
  });
  revalidatePath("/channels");
}

/** Pushes every listable product to the connected Meta catalog now. */
export async function syncChannel(_state: ChannelActionState, formData: FormData): Promise<ChannelActionState> {
  const store = await sellerStore();
  const channel = channelSchema.safeParse(formData.get("channel"));
  const t = await getT("social");
  if (!store || !channel.success) return { message: t("act.signIn") };
  if (channel.data !== "meta" && channel.data !== "whatsapp") return { message: t("act.daily") };
  return syncMeta(store, channel.data as Extract<FeedChannel, "meta" | "whatsapp">);
}

async function syncMeta(store: { id: string; name: string; slug: string; customDomain: string | null }, channel: "meta" | "whatsapp"): Promise<ChannelActionState> {
  const connection = await db.socialChannelConnection.findUnique({ where: { storeId_channel: { storeId: store.id, channel } } });
  const token = decryptJson<{ token: string }>(connection?.tokenEnc)?.token;
  if (!connection?.externalId || !token) return { message: (await getT("social"))("act.connectFirst") };
  try {
    const result = await pushMetaCatalog(store, channel, connection.externalId, token);
    const message = `Sent ${result.sent} product${result.sent === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} left out, see "Products other apps can show")` : ""}. Facebook usually shows changes within a few minutes.`;
    await db.socialChannelConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncMessage: message } });
    revalidatePath("/channels");
    return { ok: true, message };
  } catch (error) {
    const message = `Sync failed: ${error instanceof Error ? error.message : "unknown error"}`;
    await db.socialChannelConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncMessage: message.slice(0, 500) } });
    revalidatePath("/channels");
    return { message: plainMetaError(message) };
  }
}
