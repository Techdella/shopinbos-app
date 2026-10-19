import "server-only";

import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { disconnectMetaAds } from "@/lib/ad-campaigns/meta.server";
import { disconnectChannel } from "@/lib/inbox/connect";
import { disconnectCatalog } from "@/lib/whatsapp-catalog/server";
import { hashMetaUserId } from "./signed-request";
import type { MetaLinkSource } from "./user-links.server";

// What happens when a Facebook person removes Shopinbos from their account (Settings › Business integrations).
//
//   Deauthorize: their tokens stop working, so every connection they made is switched off and its keys are forgotten
//   (the seller sees "Facebook access was removed" and can connect again). Conversations, products and orders stay.
//
//   Data deletion: the same, and everything we got from Meta about those connections goes too: account, Page,
//   business, WhatsApp account and catalog IDs and names, and the record of who connected. The request is kept
//   under its confirmation code with a hash of the user ID, so the status page can answer without holding the ID.
//
// What stays: the store's own records (products, orders, and the messages customers sent the store), which belong
// to the seller's business, not to the Facebook person. Closing the Shopinbos account deletes those.

const REMOVED_MESSAGE = "Facebook access was removed from Meta's side. Connect again to keep using it.";
const INBOX_CHANNELS = { inbox_whatsapp: "whatsapp", inbox_messenger: "messenger", inbox_instagram: "instagram" } as const;

type Mode = "deauthorize" | "delete";

export interface MetaUserDataSummary {
  stores: number;
  connections: Partial<Record<MetaLinkSource, number>>;
}

async function switchOff(storeId: string, source: MetaLinkSource, mode: Mode) {
  if (source in INBOX_CHANNELS) {
    const channel = INBOX_CHANNELS[source as keyof typeof INBOX_CHANNELS];
    await disconnectChannel(storeId, channel);
    const erase = mode === "delete" ? { externalId: null, displayName: null, settings: {} } : {};
    await db.inboxChannel.updateMany({ where: { storeId, channel }, data: { lastError: REMOVED_MESSAGE, ...erase } });
    if (channel === "whatsapp") {
      // The WhatsApp catalog sync uses this number's token.
      await disconnectCatalog(storeId);
      if (mode === "delete") await db.whatsAppCatalog.updateMany({ where: { storeId }, data: { businessId: null, wabaId: null } });
    }
    return;
  }
  if (source === "meta_ads") {
    await disconnectMetaAds(storeId);
    return;
  }
  // sales_meta: no calls to Meta (the token is dead), just forget it locally.
  await db.socialChannelConnection.updateMany({
    where: { storeId, channel: "meta" },
    data:
      mode === "delete"
        ? { tokenEnc: null, tokenExpiresAt: null, status: null, accountId: null, externalId: null, feedId: null, productCount: null, connectedAt: null, lastSyncAt: null, lastSyncStatus: null, lastSyncMessage: null }
        : { tokenEnc: null, tokenExpiresAt: null, status: "reauth", lastSyncStatus: "error", lastSyncMessage: REMOVED_MESSAGE },
  });
}

async function applyToUser(metaUserId: string, mode: Mode): Promise<MetaUserDataSummary> {
  const links = await db.metaUserLink.findMany({ where: { metaUserId } });
  const summary: MetaUserDataSummary = { stores: new Set(links.map((link) => link.storeId)).size, connections: {} };
  for (const link of links) {
    const source = link.source as MetaLinkSource;
    await switchOff(link.storeId, source, mode);
    summary.connections[source] = (summary.connections[source] ?? 0) + 1;
  }
  await db.metaUserLink.deleteMany({ where: { metaUserId } });
  return summary;
}

/** Deauthorize callback: switch off what this person connected. */
export async function deauthorizeMetaUser(metaUserId: string) {
  const summary = await applyToUser(metaUserId, "deauthorize");
  console.info(`[meta] deauthorized: ${summary.stores} store(s)`, summary.connections);
  return summary;
}

/** Data deletion callback, part 1: record the request so the status page knows about it straight away. */
export async function createDeletionRequest(metaUserId: string, confirmationCode: string) {
  await db.metaDataDeletionRequest.create({ data: { confirmationCode, metaUserHash: hashMetaUserId(metaUserId) } });
}

/** Part 2 (after the response): delete, then mark the request done or failed. */
export async function runDeletionRequest(metaUserId: string, confirmationCode: string) {
  try {
    const summary = await applyToUser(metaUserId, "delete");
    await db.metaDataDeletionRequest.update({
      where: { confirmationCode },
      data: { status: "completed", storesAffected: summary.stores, summary: summary as unknown as Prisma.InputJsonValue, completedAt: new Date() },
    });
  } catch (error) {
    console.error("[meta] data deletion failed", error);
    Sentry.captureException(error, { tags: { area: "meta-data-deletion" } });
    await db.metaDataDeletionRequest
      .update({ where: { confirmationCode }, data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" } })
      .catch(() => undefined);
  }
}

export async function deletionRequestStatus(confirmationCode: string) {
  return db.metaDataDeletionRequest.findUnique({
    where: { confirmationCode },
    select: { status: true, requestedAt: true, completedAt: true, storesAffected: true },
  });
}
