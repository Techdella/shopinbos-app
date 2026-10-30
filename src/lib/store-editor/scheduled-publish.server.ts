import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { publishStoreDraft, StorePublishError } from "@/lib/store-publishing";
import { createSnapshotFromTemplate, getCurrentTemplateMeta, getTemplateManifest, resolveDraftSnapshot, type StoreBrandSettingsLike, type StoreEditorSnapshot } from "@/lib/store-templates";
import { storedDraftVersion } from "@/lib/store-editor/mobile.server";
import { draftVersion, lagosClock, scheduleOutcome, scheduleProblem, type ScheduledPublish } from "@shared/store-editor";

// "Schedule for later" (the phone's Publish sheet, design SE-13). The seller picks a time (Lagos time); we keep the
// draft exactly as it is then (ScheduledStorePublish.snapshot, docs/migrations/2026-12-19-scheduled-publish.sql) and
// /api/cron/store-publish (every 5 minutes) puts it live at that time with the same publishStoreDraft as Publish now.
//   * Changed the draft after scheduling? The scheduled version still goes live (what they chose to schedule) and
//     the newer changes stay in the draft; the "it's live" message tells them so.
//   * One publish waits per store: scheduling again replaces it (reschedule); Cancel takes it off.
//   * Publishing by hand (phone or computer) replaces the scheduled one, so an older version never comes back.
//   * Claimed before it runs (scheduled → publishing), so two runs never publish it twice; one cut off mid-way is
//     picked up again after STUCK_MS.

const ACTIVE = ["scheduled", "publishing"];
const STUCK_MS = 15 * 60 * 1000;

const tableMissing = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
};

type Row = { id: string; runAt: Date; status: string; draftVersion: string; draftChanged: boolean };

export function scheduleView(row: Row, currentVersion?: string): ScheduledPublish {
  return {
    id: row.id,
    runAt: row.runAt.toISOString(),
    status: row.status as ScheduledPublish["status"],
    draftVersion: row.draftVersion,
    draftChanged: currentVersion === undefined ? row.draftChanged : scheduleOutcome(currentVersion, row.draftVersion) === "changed",
  };
}

/** The publish waiting for this store (null: none, or the table isn't there yet). */
export async function loadScheduledPublish(storeId: string, brandSettings?: unknown): Promise<ScheduledPublish | null> {
  try {
    const row = await db.scheduledStorePublish.findFirst({ where: { storeId, status: { in: ACTIVE } }, orderBy: { runAt: "asc" }, select: { id: true, runAt: true, status: true, draftVersion: true, draftChanged: true } });
    return row ? scheduleView(row, brandSettings === undefined ? undefined : storedDraftVersion(brandSettings)) : null;
  } catch (error) {
    if (tableMissing(error)) return null;
    throw error;
  }
}

export class ScheduleError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
  }
}

/** The draft the store has saved now (the look's own starting design when there's none yet). */
function savedDraft(store: { brandSettings: unknown }): StoreEditorSnapshot | null {
  const settings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const template = getCurrentTemplateMeta(settings);
  const manifest = template ? getTemplateManifest(template.templateId) : null;
  return resolveDraftSnapshot(settings, manifest ? createSnapshotFromTemplate(manifest) : null);
}

/**
 * Schedules the saved draft (which must be the version the phone saw: `version`) to go live at `at`. Replaces a
 * publish already waiting (reschedule).
 */
export async function schedulePublish(input: { userId: string; at: Date; version: string | null; now?: Date }): Promise<ScheduledPublish> {
  const problem = scheduleProblem(input.at, input.now ?? new Date());
  if (problem === "past" || problem === "tooSoon") throw new ScheduleError("Pick a time at least 10 minutes from now.", "TOO_SOON", 400);
  if (problem === "tooFar") throw new ScheduleError("Pick a time in the next two months.", "TOO_FAR", 400);

  const store = await db.store.findUnique({ where: { userId: input.userId }, select: { id: true, brandSettings: true } });
  if (!store) throw new ScheduleError("Set up your shop first.", "NOT_FOUND", 404);
  const draft = savedDraft(store);
  if (!draft) throw new ScheduleError("There's nothing to publish yet.", "BAD_REQUEST", 400);
  const version = storedDraftVersion(store.brandSettings);
  if (input.version && version && input.version !== version) throw new ScheduleError("Your shop was changed on another device. Check the newest version, then schedule.", "CONFLICT", 409);

  const data = {
    storeId: store.id,
    userId: input.userId,
    runAt: input.at,
    snapshot: JSON.parse(JSON.stringify(draft)) as Prisma.InputJsonValue,
    draftVersion: version || draftVersion(draft),
    status: "scheduled",
    draftChanged: false,
    error: null,
  };
  try {
    const row = await db.$transaction(async (tx) => {
      await tx.scheduledStorePublish.updateMany({ where: { storeId: store.id, status: "scheduled" }, data: { status: "cancelled", cancelledAt: new Date() } });
      return tx.scheduledStorePublish.create({ data, select: { id: true, runAt: true, status: true, draftVersion: true, draftChanged: true } });
    });
    return scheduleView(row);
  } catch (error) {
    if (tableMissing(error)) throw new ScheduleError("Scheduling isn't switched on yet. Publish now instead.", "UNAVAILABLE", 503);
    // One is going live right now (publishing): it can't be replaced mid-way.
    if ((error as { code?: string }).code === "P2002") throw new ScheduleError("Your scheduled publish is going live right now. Try again in a minute.", "BUSY", 409);
    throw error;
  }
}

/** Takes off the publish waiting for this seller's store. True when there was one. */
export async function cancelScheduledPublish(userId: string): Promise<boolean> {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return false;
  try {
    const moved = await db.scheduledStorePublish.updateMany({ where: { storeId: store.id, status: "scheduled" }, data: { status: "cancelled", cancelledAt: new Date() } });
    return moved.count > 0;
  } catch (error) {
    if (tableMissing(error)) return false;
    throw error;
  }
}

/** Publishing by hand replaces what was scheduled (called by publishStoreDraft). */
export async function supersedeScheduledPublish(storeId: string) {
  try {
    await db.scheduledStorePublish.updateMany({ where: { storeId, status: "scheduled" }, data: { status: "cancelled", cancelledAt: new Date(), error: "Published by hand before the scheduled time." } });
  } catch (error) {
    if (!tableMissing(error)) throw error;
  }
}

/** Every publish whose time has come (and any cut off mid-way), once each. */
export async function runScheduledPublishes(now = new Date(), limit = 50) {
  let rows: Array<{ id: string; storeId: string; userId: string; runAt: Date; status: string; draftVersion: string; snapshot: Prisma.JsonValue }>;
  try {
    rows = await db.scheduledStorePublish.findMany({
      where: {
        OR: [
          { status: "scheduled", runAt: { lte: now } },
          { status: "publishing", updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
        ],
      },
      orderBy: { runAt: "asc" },
      take: limit,
      select: { id: true, storeId: true, userId: true, runAt: true, status: true, draftVersion: true, snapshot: true },
    });
  } catch (error) {
    if (tableMissing(error)) return { due: 0, published: 0, failed: 0 };
    throw error;
  }

  let published = 0;
  let failed = 0;
  for (const row of rows) {
    // Claim it: only one run publishes it.
    const claimed = await db.scheduledStorePublish.updateMany({ where: { id: row.id, status: row.status, ...(row.status === "publishing" ? { updatedAt: { lt: new Date(now.getTime() - STUCK_MS) } } : {}) }, data: { status: "publishing" } });
    if (claimed.count !== 1) continue;
    const store = await db.store.findUnique({ where: { id: row.storeId }, select: { id: true, slug: true, customDomain: true, brandSettings: true } });
    if (!store) {
      await db.scheduledStorePublish.update({ where: { id: row.id }, data: { status: "failed", error: "Store not found" } });
      failed += 1;
      continue;
    }
    const changed = scheduleOutcome(storedDraftVersion(store.brandSettings), row.draftVersion) === "changed";
    try {
      await publishStoreDraft({ storeId: store.id }, { snapshot: row.snapshot as unknown as StoreEditorSnapshot, keepDraft: changed, scheduled: true });
      await db.scheduledStorePublish.update({ where: { id: row.id }, data: { status: "published", publishedAt: new Date(), draftChanged: changed, error: null } });
      published += 1;
      await notify({
        userId: row.userId,
        type: "store_builder",
        priority: "success",
        title: "Your shop changes are live",
        description: changed
          ? `The version you scheduled for ${lagosClock(row.runAt)} is live. Changes you made after scheduling are still in your draft: open Edit shop to publish them too.`
          : `What you scheduled for ${lagosClock(row.runAt)} is now live for customers.`,
        link: buildStorefrontUrl(store) ?? "/seller/store/builder",
        appRoute: "/shop",
        dedupeKey: `scheduled-publish:${row.id}`,
        // They chose this time themselves, so quiet hours don't hold it.
        urgent: true,
        metadata: { scheduledPublishId: row.id, draftChanged: changed },
      }).catch((error) => console.error("[scheduled-publish] notify failed", row.id, error));
    } catch (error) {
      const message = error instanceof StorePublishError ? error.blockers?.[0] ?? error.message : error instanceof Error ? error.message : "Publishing failed";
      await db.scheduledStorePublish.update({ where: { id: row.id }, data: { status: "failed", error: message.slice(0, 500) } }).catch(() => undefined);
      failed += 1;
      await notify({
        userId: row.userId,
        type: "store_builder",
        priority: "warning",
        title: "Your scheduled publish didn't go live",
        description: `${message} Open Edit shop to fix it and publish.`,
        link: "/seller/store/builder",
        appRoute: "/store-editor",
        dedupeKey: `scheduled-publish-failed:${row.id}`,
        urgent: true,
        metadata: { scheduledPublishId: row.id },
      }).catch((notifyError) => console.error("[scheduled-publish] notify failed", row.id, notifyError));
    }
  }
  return { due: rows.length, published, failed };
}
