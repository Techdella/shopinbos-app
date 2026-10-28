import "server-only";
import type { BulkProductItem, BulkProductSession, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { BULK_MAX_ITEMS, nextAsk, readiness, suggestGroups, summarize, type BulkEvent, type BulkItem, type BulkRole } from "@shared/bulk-products";

// "Add many with Peggy" sessions (shared/bulk-products.ts): one open session per person at a time, its items (one per
// product, numbered for the chat) and Peggy's chat. Always the signed-in person's own.

export function bulkRoleOf(role: string): BulkRole | null {
  return role === "seller" || role === "supplier" ? role : null;
}

export function toItem(row: BulkProductItem): BulkItem {
  return {
    id: row.id,
    number: row.number,
    photos: row.photos,
    name: row.name,
    description: row.description,
    category: row.category,
    priceKobo: row.priceKobo,
    hintLowKobo: row.hintLowKobo,
    hintHighKobo: row.hintHighKobo,
    stock: row.stock,
    colours: row.colours,
    lookKey: row.lookKey,
    colour: row.colour,
    aiState: row.aiState.startsWith("working") ? "working" : row.aiState,
    removed: row.removed,
    productId: row.productId,
    publishError: row.publishError,
    fileName: row.fileName,
  };
}

export function threadOf(session: Pick<BulkProductSession, "thread">): BulkEvent[] {
  return Array.isArray(session.thread) ? (session.thread as unknown as BulkEvent[]) : [];
}

export function newEventId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Adds events to the end of the chat in one statement (two requests at once never lose one). */
export async function appendEvents(sessionId: string, events: BulkEvent[]) {
  if (!events.length) return;
  await db.$executeRaw`UPDATE "BulkProductSession" SET "thread" = "thread" || ${JSON.stringify(events)}::jsonb, "updatedAt" = NOW() WHERE "id" = ${sessionId}`;
}

export async function findSession(userId: string, id: string) {
  return db.bulkProductSession.findFirst({ where: { id, userId, status: { in: ["open", "publishing"] } } });
}

/** The person's open session, or a new one with Peggy's hello. */
export async function openSession(userId: string, role: BulkRole) {
  const existing = await db.bulkProductSession.findFirst({ where: { userId, role, status: { in: ["open", "publishing"] } }, orderBy: { updatedAt: "desc" } });
  if (existing) return existing;
  const hello: BulkEvent = { id: newEventId(), at: new Date().toISOString(), from: "peggy", kind: "hello" };
  return db.bulkProductSession.create({ data: { userId, role, thread: [hello] as unknown as Prisma.InputJsonValue } });
}

export async function sessionItems(sessionId: string) {
  const rows = await db.bulkProductItem.findMany({ where: { sessionId }, orderBy: { number: "asc" } });
  return rows.map(toItem);
}

/** Everything the screen shows: the items, the chat, where things stand, what Peggy asks next and her join ideas. */
export async function sessionView(session: BulkProductSession) {
  const items = await sessionItems(session.id);
  const role = (bulkRoleOf(session.role) ?? "seller") as BulkRole;
  return {
    id: session.id,
    role,
    status: session.status,
    thread: threadOf(session),
    items: items.filter((item) => !item.removed),
    summary: summarize(items),
    ask: nextAsk(items),
    groups: suggestGroups(items, role, session.dismissed),
    ready: items.filter((item) => readiness(item) === "ready").length,
    max: BULK_MAX_ITEMS,
  };
}

export type BulkSessionView = Awaited<ReturnType<typeof sessionView>>;

/**
 * Adds one uploaded photo as a new product (one photo = one product). A retried upload (same clientKey) returns the
 * item it already made. Numbers come from the session's counter, taken atomically.
 */
export async function addPhotoItem(sessionId: string, input: { clientKey: string; fileName: string | null; url: string }) {
  const existing = await db.bulkProductItem.findUnique({ where: { sessionId_clientKey: { sessionId, clientKey: input.clientKey } } });
  if (existing) return { item: toItem(existing), created: false };
  const count = await db.bulkProductItem.count({ where: { sessionId, removed: false } });
  if (count >= BULK_MAX_ITEMS) return { item: null, created: false, full: true as const };
  const { nextNumber } = await db.bulkProductSession.update({ where: { id: sessionId }, data: { nextNumber: { increment: 1 } }, select: { nextNumber: true } });
  try {
    const row = await db.bulkProductItem.create({ data: { sessionId, number: nextNumber - 1, clientKey: input.clientKey, fileName: input.fileName, photos: [input.url] } });
    return { item: toItem(row), created: true };
  } catch (error) {
    // The same photo sent twice at the same moment: the other request made it.
    const again = await db.bulkProductItem.findUnique({ where: { sessionId_clientKey: { sessionId, clientKey: input.clientKey } } });
    if (again) return { item: toItem(again), created: false };
    throw error;
  }
}

/** Saves edits to unpublished items by number. Same patch for many numbers → one statement. */
export async function saveChanges(sessionId: string, changes: Array<{ n: number } & Prisma.BulkProductItemUpdateManyMutationInput>) {
  const groups = new Map<string, { patch: Prisma.BulkProductItemUpdateManyMutationInput; numbers: number[] }>();
  for (const { n, ...patch } of changes) {
    const key = JSON.stringify(patch);
    const group = groups.get(key) ?? { patch, numbers: [] };
    group.numbers.push(n);
    groups.set(key, group);
  }
  for (const { patch, numbers } of groups.values()) {
    await db.bulkProductItem.updateMany({ where: { sessionId, number: { in: numbers }, productId: null }, data: patch });
  }
}
