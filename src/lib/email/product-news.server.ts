import "server-only";

import type { Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { sendEmailBatch, type BatchEmail } from "@/lib/notifications/resend";
import { buildPlatformEmail, sendPlatformEmail } from "./compliance.server";
import { platformEventKey } from "./preferences";
import { NEWS_INTERRUPTED, NEWS_UNKNOWN_PREFIX, NewsRunError, processNewsBroadcast, retryNewsFailed, type NewsRecipient, type NewsRunInput, type NewsStore } from "./product-news-run";
import { productNewsBody, productNewsCta, splitNewsAudience, type NewsAudience, type NewsImageHosts, type ProductNewsContent, type ProductNewsInput } from "./product-news";

// Product news broadcasts (/admin/product-news): drafts, the recipient snapshot, and sending in batches.
//
// No double sends: recipients are rows unique per (broadcast, user). A batch is claimed with
// UPDATE … WHERE status = 'queued' … FOR UPDATE SKIP LOCKED, so two overlapping runs never take the same rows, and
// a row only goes back to "queued" when the provider refused its batch (nothing was delivered). A row left in
// "sending" by a run that died, or whose batch got no answer from the provider, is never resent: it's closed as
// failed with an error "Retry failed" skips. The rules are in product-news-run.ts (unit-tested).
// Users who turned off "Product news and tips" get a "skipped" row (counted, never emailed), checked again just
// before each batch.


export class ProductNewsError extends Error {
  constructor(message: string, readonly code = "BAD_REQUEST", readonly status = 400) {
    super(message);
  }
}

function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

/** Where product news images may come from: our Supabase Storage (public objects) and our own sites. */
export function newsImageHosts(): NewsImageHosts {
  const storage = [hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL)].filter((h): h is string => Boolean(h));
  const own = ["shopinbos.com", hostOf(getPublicEnv().appUrl)].filter((h): h is string => Boolean(h));
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") && process.env.VERCEL_ENV !== "production";
  return { storage, own: [...new Set(own)], ...(local ? { localStorageHttp: true } : {}) };
}

export const BROADCAST_SELECT = {
  id: true,
  subject: true,
  preheader: true,
  heading: true,
  body: true,
  imageUrl: true,
  ctaLabel: true,
  ctaUrl: true,
  audience: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  sentAt: true,
  recipientCount: true,
  sentCount: true,
  failedCount: true,
  skippedCount: true,
  lastError: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

function clean(input: ProductNewsInput) {
  return {
    subject: input.subject,
    preheader: input.preheader?.trim() || null,
    heading: input.heading,
    body: input.body,
    imageUrl: input.imageUrl?.trim() || null,
    ctaLabel: input.ctaLabel?.trim() || null,
    ctaUrl: input.ctaUrl?.trim() || null,
    audience: [...new Set(input.audience)],
  };
}

// ─── Audience ────────────────────────────────────────────────────────────────

const optedOut = () => ({ some: { category: "system" as const, eventKey: platformEventKey("product_news"), email: false } });

/** Per role: everyone with an email, how many turned product news off, and who'd get it. */
export async function audienceCounts(audience: readonly NewsAudience[]) {
  const roles = [...new Set(audience)];
  const rows = await Promise.all(
    roles.map(async (role) => {
      const where = { role: role as Role, email: { not: null }, NOT: { email: "" } };
      const [total, off] = await Promise.all([db.user.count({ where }), db.user.count({ where: { ...where, notificationPreferences: optedOut() } })]);
      return { role, total, optedOut: off, eligible: total - off };
    }),
  );
  return {
    byRole: rows,
    total: rows.reduce((t, r) => t + r.total, 0),
    optedOut: rows.reduce((t, r) => t + r.optedOut, 0),
    eligible: rows.reduce((t, r) => t + r.eligible, 0),
  };
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export async function createBroadcast(input: ProductNewsInput, createdById: string) {
  return db.productNewsBroadcast.create({ data: { ...clean(input), createdById, status: "draft" }, select: BROADCAST_SELECT });
}

export async function updateBroadcast(id: string, input: ProductNewsInput) {
  const moved = await db.productNewsBroadcast.updateMany({ where: { id, status: { in: ["draft", "scheduled"] } }, data: clean(input) });
  if (moved.count !== 1) throw new ProductNewsError("Only drafts and scheduled emails can be edited", "CONFLICT", 409);
  return db.productNewsBroadcast.findUniqueOrThrow({ where: { id }, select: BROADCAST_SELECT });
}

export async function unscheduleBroadcast(id: string) {
  const moved = await db.productNewsBroadcast.updateMany({ where: { id, status: "scheduled" }, data: { status: "draft", scheduledAt: null } });
  if (moved.count !== 1) throw new ProductNewsError("It isn't scheduled", "CONFLICT", 409);
  return db.productNewsBroadcast.findUniqueOrThrow({ where: { id }, select: BROADCAST_SELECT });
}

export async function deleteDraft(id: string) {
  const gone = await db.productNewsBroadcast.deleteMany({ where: { id, status: { in: ["draft", "scheduled"] } } });
  if (gone.count !== 1) throw new ProductNewsError("Only drafts can be deleted", "CONFLICT", 409);
}

function emailFor(content: ProductNewsContent, user: { id: string; role: string }) {
  return buildPlatformEmail({
    user,
    kind: "lifecycle",
    topic: "product_news",
    eyebrow: "Product news",
    heading: content.heading,
    bodyHtml: productNewsBody(content, newsImageHosts()),
    preheader: content.preheader || null,
    cta: productNewsCta(content),
  });
}

/** "[Test]" to the admin's own inbox. Not a broadcast: nothing is saved and preferences don't apply. */
export async function sendProductNewsTest(content: ProductNewsContent, admin: { id: string; email: string | null }) {
  if (!admin.email) throw new ProductNewsError("Add an email address to your account to get test emails");
  const result = await sendPlatformEmail({
    to: admin.email,
    user: { id: admin.id, role: "admin" },
    kind: "lifecycle",
    subject: `[Test] ${content.subject}`,
    eyebrow: "Product news",
    heading: content.heading,
    bodyHtml: productNewsBody(content, newsImageHosts()),
    preheader: content.preheader || null,
    cta: productNewsCta(content),
  });
  if (!result.success) throw new ProductNewsError(result.message ?? "The test email couldn't be sent", "SEND_FAILED", 502);
  return { to: admin.email };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** Everyone in the audience gets a row: queued, or skipped when they turned product news off. Idempotent. */
async function snapshotRecipients(broadcastId: string, audience: readonly string[]) {
  const users = await db.user.findMany({
    where: { role: { in: audience as Role[] }, email: { not: null }, NOT: { email: "" } },
    select: { id: true, role: true, email: true, notificationPreferences: { where: { category: "system", eventKey: platformEventKey("product_news") }, select: { email: true } } },
  });
  const { send, skipped } = splitNewsAudience(
    users.map((user) => ({ id: user.id, role: user.role as string, email: user.email, productNewsOff: user.notificationPreferences.some((p) => !p.email) })),
    audience,
  );
  for (let i = 0; i < send.length; i += 1000)
    await db.productNewsRecipient.createMany({ data: send.slice(i, i + 1000).map((u) => ({ broadcastId, userId: u.id, email: u.email!.trim(), role: u.role, status: "queued" })), skipDuplicates: true });
  for (let i = 0; i < skipped.length; i += 1000)
    await db.productNewsRecipient.createMany({ data: skipped.slice(i, i + 1000).map((u) => ({ broadcastId, userId: u.id, email: u.email!.trim(), role: u.role, status: "skipped", error: "Turned off product news" })), skipDuplicates: true });
}

async function refreshCounts(broadcastId: string) {
  const groups = await db.productNewsRecipient.groupBy({ by: ["status"], where: { broadcastId }, _count: { _all: true } });
  const n = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  const counts = { sent: n("sent"), failed: n("failed"), skipped: n("skipped"), queued: n("queued"), sending: n("sending") };
  await db.productNewsBroadcast.update({ where: { id: broadcastId }, data: { recipientCount: counts.sent + counts.failed + counts.skipped + counts.queued + counts.sending, sentCount: counts.sent, failedCount: counts.failed, skippedCount: counts.skipped } });
  return counts;
}

/** Starts a draft now, or schedules it for later. Starting again (already sending) just carries on. */
export async function startBroadcast(id: string, options: { scheduledAt?: Date | null; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const broadcast = await db.productNewsBroadcast.findUnique({ where: { id }, select: { status: true } });
  if (!broadcast) throw new ProductNewsError("Not found", "NOT_FOUND", 404);
  if (broadcast.status === "sent") return processBroadcast(id);
  if (options.scheduledAt && options.scheduledAt.getTime() > now.getTime() + 60_000) {
    const moved = await db.productNewsBroadcast.updateMany({ where: { id, status: { in: ["draft", "scheduled"] } }, data: { status: "scheduled", scheduledAt: options.scheduledAt } });
    if (moved.count !== 1) throw new ProductNewsError("It's already sending", "CONFLICT", 409);
    return { status: "scheduled" as const };
  }
  await db.productNewsBroadcast.updateMany({ where: { id, status: { in: ["draft", "scheduled"] } }, data: { status: "sending", startedAt: now, lastError: null } });
  return processBroadcast(id);
}

function prismaStore(content: ProductNewsContent | null): NewsStore<BatchEmail> {
  return {
    async status(id) {
      return (await db.productNewsBroadcast.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
    },
    async hasRecipients(id) {
      return (await db.productNewsRecipient.count({ where: { broadcastId: id } })) > 0;
    },
    async snapshot(id) {
      const b = await db.productNewsBroadcast.findUniqueOrThrow({ where: { id }, select: { audience: true } });
      await snapshotRecipients(id, b.audience);
    },
    claim: (id, take) => db.$queryRaw<NewsRecipient[]>`
      UPDATE "ProductNewsRecipient" SET "status" = 'sending', "updatedAt" = now()
      WHERE "id" IN (
        SELECT "id" FROM "ProductNewsRecipient"
        WHERE "broadcastId" = ${id} AND "status" = 'queued'
        ORDER BY "id" LIMIT ${take}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "userId", "email", "role"`,
    async optedOut(userIds) {
      const rows = await db.notificationPreference.findMany({ where: { userId: { in: userIds }, category: "system", eventKey: platformEventKey("product_news"), email: false }, select: { userId: true } });
      return new Set(rows.map((p) => p.userId));
    },
    build(_id, r) {
      if (!content) throw new Error("No content to send");
      const { html, headers } = emailFor(content, { id: r.userId, role: r.role });
      return { to: r.email, subject: content.subject, html, headers };
    },
    async markSkipped(rowIds) {
      await db.productNewsRecipient.updateMany({ where: { id: { in: rowIds }, status: "sending" }, data: { status: "skipped", error: "Turned off product news" } });
    },
    async markSent(rowIds, at) {
      await db.productNewsRecipient.updateMany({ where: { id: { in: rowIds }, status: "sending" }, data: { status: "sent", sentAt: at, error: null } });
    },
    async markFailed(rowIds, error) {
      await db.productNewsRecipient.updateMany({ where: { id: { in: rowIds }, status: "sending" }, data: { status: "failed", error } });
    },
    async closeStale(id, before) {
      await db.productNewsRecipient.updateMany({ where: { broadcastId: id, status: "sending", updatedAt: { lt: before } }, data: { status: "failed", error: NEWS_INTERRUPTED } });
    },
    refreshCounts,
    async finish(id, status, lastError, at) {
      await db.productNewsBroadcast.updateMany({ where: { id, status: "sending" }, data: { status, sentAt: at, lastError } });
    },
    async setLastError(id, lastError) {
      await db.productNewsBroadcast.update({ where: { id }, data: { lastError } });
    },
    async requeueRetryable(id) {
      // Explicit about NULL errors: NOT (error = x) alone would skip them.
      const moved = await db.productNewsRecipient.updateMany({
        where: { broadcastId: id, status: "failed", OR: [{ error: null }, { AND: [{ NOT: { error: NEWS_INTERRUPTED } }, { NOT: { error: { startsWith: NEWS_UNKNOWN_PREFIX } } }] }] },
        data: { status: "queued", error: null },
      });
      return moved.count;
    },
    async resume(id) {
      await db.productNewsBroadcast.update({ where: { id }, data: { status: "sending", lastError: null } });
    },
  };
}

function runInput(id: string, content: ProductNewsContent | null, options: { deadline?: number; maxBatches?: number }): NewsRunInput<BatchEmail> {
  return {
    id,
    store: prismaStore(content),
    // Permissive: one bad address is reported on its own instead of refusing the whole batch.
    send: (emails) => sendEmailBatch(emails, { permissive: true }),
    deadline: options.deadline ?? Date.now() + 50_000,
    maxBatches: options.maxBatches ?? 20,
  };
}

const loadContent = (id: string) => db.productNewsBroadcast.findUnique({ where: { id }, select: BROADCAST_SELECT });

/** Sends the next batches (bounded by time), then updates the counts; marks it sent once nothing is left. */
export async function processBroadcast(id: string, options: { deadline?: number; maxBatches?: number } = {}) {
  try {
    return await processNewsBroadcast(runInput(id, await loadContent(id), options));
  } catch (error) {
    throw error instanceof NewsRunError ? new ProductNewsError(error.message, error.code, error.status) : error;
  }
}

/** Puts recipients whose batch the provider refused back in the queue (never ones that may have been delivered). */
export async function retryFailed(id: string) {
  try {
    return await retryNewsFailed(runInput(id, await loadContent(id), {}));
  } catch (error) {
    throw error instanceof NewsRunError ? new ProductNewsError(error.message, error.code, error.status) : error;
  }
}

/** The cron: starts scheduled broadcasts that are due and carries on with any still sending. */
export async function runProductNewsCron(now = new Date(), deadline = Date.now() + 240_000) {
  const due = await db.productNewsBroadcast.findMany({ where: { status: "scheduled", scheduledAt: { lte: now } }, select: { id: true }, take: 10 });
  const started: string[] = [];
  for (const b of due) {
    const moved = await db.productNewsBroadcast.updateMany({ where: { id: b.id, status: "scheduled" }, data: { status: "sending", startedAt: now } });
    if (moved.count === 1) started.push(b.id);
  }
  const sending = await db.productNewsBroadcast.findMany({ where: { status: "sending" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 10 });
  const results: Array<{ id: string; status: string; sent: number; failed: number; skipped: number; queued: number }> = [];
  for (const b of sending) {
    if (Date.now() >= deadline) break;
    const r = await processBroadcast(b.id, { deadline, maxBatches: 50 });
    results.push({ id: b.id, status: r.status, sent: r.sent, failed: r.failed, skipped: r.skipped, queued: r.queued });
  }
  return { started, results };
}
