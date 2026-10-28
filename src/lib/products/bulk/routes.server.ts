import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { UploadRejectedError } from "@/lib/supabase/storage.server";
import { BULK_MAX_PRICE_KOBO, BULK_MAX_STOCK, joinItems, type BulkRole } from "@shared/bulk-products";
import { addPhotoItem, bulkRoleOf, findSession, openSession, sessionItems, sessionView, toItem } from "./session.server";
import { BULK_PHOTO_MAX_BYTES, BULK_PHOTO_TYPES, draftNextBatch, storeBulkPhoto } from "./vision.server";
import { answerReply } from "./reply.server";
import { publishChunk } from "./publish.server";

// The "Add many with Peggy" API, for sellers and suppliers, on the phone (/api/mobile/bulk-products/**) and the web
// (/api/app/bulk-products/**: the same handlers). Every session and item is the signed-in person's own.
//
//   GET    /                      the open session (or null)          POST /           open one (or the open one)
//   GET    /:id                   items, chat, progress, Peggy's next question and join ideas
//   DELETE /:id                   discard it
//   POST   /:id/photos            one photo (multipart: file, clientKey, fileName) → one product; retries are safe
//   POST   /:id/look              Peggy reads the next 10 waiting photos
//   POST   /:id/reply  {text}     a chat reply → changes
//   PATCH  /:id/items  {op,…}     edit by hand, bulk set, remove, join, split, dismiss a join idea
//   POST   /:id/publish {live}    publish the next 20 ready ones

type Ctx = { user: { id: string; role: string }; params: Record<string, string> };
const withBulk = (handler: (req: NextRequest, ctx: Ctx & { role: BulkRole }) => Promise<NextResponse>) =>
  withAuth(async (req, ctx) => {
    const role = bulkRoleOf(ctx.user.role);
    if (!role) return apiError("FORBIDDEN", "Only sellers and suppliers can add products.", 403);
    return handler(req, { ...(ctx as Ctx), role });
  }, ["seller", "supplier"]);

async function ownSession(userId: string, id: unknown) {
  return typeof id === "string" && id.length < 60 ? findSession(userId, id) : null;
}

const notFound = () => apiError("NOT_FOUND", "That list of products isn't there any more. Start again.", 404);

export const listHandler = withBulk(async (_req, { user, role }) => {
  const session = await db.bulkProductSession.findFirst({ where: { userId: user.id, role, status: { in: ["open", "publishing"] } }, orderBy: { updatedAt: "desc" } });
  return ok(session ? await sessionView(session) : null);
});

export const createHandler = withBulk(async (_req, { user, role }) => {
  const session = await openSession(user.id, role);
  return ok(await sessionView(session), 201);
});

export const getHandler = withBulk(async (_req, { user, params }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  return ok(await sessionView(session));
});

export const deleteHandler = withBulk(async (_req, { user, params }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  await db.bulkProductSession.update({ where: { id: session.id }, data: { status: "discarded" } });
  return ok({ discarded: true });
});

export const photoHandler = withBulk(async (req, { user, params, role }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  const burst = await checkRateLimitShared(rateLimitKey("bulk-photo", user.id), { maxRequests: 120, windowMs: 60_000 });
  if (!burst.allowed) return apiError("RATE_LIMITED", "That's a lot of photos at once. Wait a minute and they'll carry on.", 429);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > BULK_PHOTO_MAX_BYTES + 64 * 1024) return apiError("TOO_LARGE", "That photo is bigger than 15 MB.", 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const clientKey = String(form?.get("clientKey") ?? "").trim().slice(0, 80);
  const fileName = String(form?.get("fileName") ?? "").trim().slice(0, 200) || null;
  if (!(file instanceof File) || !clientKey) return apiError("BAD_REQUEST", "Add a photo.", 400);
  if (!BULK_PHOTO_TYPES.has(file.type)) return apiError("BAD_REQUEST", "That isn't a JPG, PNG or WebP photo.", 400);
  if (file.size > BULK_PHOTO_MAX_BYTES) return apiError("TOO_LARGE", "That photo is bigger than 15 MB.", 413);
  // A retried upload: the item is already there, nothing is stored twice.
  const existing = await db.bulkProductItem.findUnique({ where: { sessionId_clientKey: { sessionId: session.id, clientKey } } });
  if (existing) return ok(toItem(existing));
  let url: string;
  try {
    url = (await storeBulkPhoto(file, role)).publicUrl;
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That file isn't a photo we can use.", 400);
    console.error("[bulk] photo upload failed", error);
    return apiError("UPLOAD_FAILED", "We couldn't save that photo. It will try again.", 502);
  }
  const added = await addPhotoItem(session.id, { clientKey, fileName, url });
  if ("full" in added && added.full) return apiError("TOO_MANY", "That's the most for one list (300). Publish these, then add more.", 409);
  return ok(added.item, added.created ? 201 : 200);
});

export const lookHandler = withBulk(async (_req, { user, params }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  const burst = await checkRateLimitShared(rateLimitKey("bulk-look", user.id), { maxRequests: 40, windowMs: 60_000 });
  if (!burst.allowed) return apiError("RATE_LIMITED", "Peggy is still looking. Give her a minute.", 429);
  const result = await draftNextBatch(session);
  const fresh = await findSession(user.id, session.id);
  return ok({ ...result, session: fresh ? await sessionView(fresh) : null });
});

const ReplySchema = z.object({ text: z.string().trim().min(1, "Type a reply.").max(2000) });

export const replyHandler = withBulk(async (req, { user, params }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  const parsed = ReplySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Type a reply.");
  const burst = await checkRateLimitShared(rateLimitKey("bulk-reply", user.id), { maxRequests: 40, windowMs: 60_000 });
  if (!burst.allowed) return apiError("RATE_LIMITED", "That's a lot of messages. Wait a minute.", 429);
  const { usedAi } = await answerReply(session, parsed.data.text);
  const fresh = await findSession(user.id, session.id);
  return ok({ usedAi, session: fresh ? await sessionView(fresh) : null });
});

const Patch = z.object({
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().max(60).optional(),
  priceKobo: z.number().int().min(1).max(BULK_MAX_PRICE_KOBO).nullable().optional(),
  stock: z.number().int().min(0).max(BULK_MAX_STOCK).nullable().optional(),
});
const Ids = z.array(z.string().min(1).max(60)).min(1).max(300);
const ItemsOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("edit"), id: z.string().min(1).max(60), patch: Patch }),
  z.object({ op: z.literal("bulk"), ids: Ids, patch: Patch }),
  z.object({ op: z.literal("remove"), ids: Ids }),
  z.object({ op: z.literal("join"), ids: Ids, kind: z.enum(["angles", "colours"]) }),
  z.object({ op: z.literal("split"), id: z.string().min(1).max(60) }),
  z.object({ op: z.literal("dismiss"), key: z.string().min(1).max(400) }),
]);

export const itemsHandler = withBulk(async (req, { user, params, role }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  const parsed = ItemsOp.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details and try again.");
  const body = parsed.data;
  const own = { sessionId: session.id, productId: null };
  if (body.op === "edit") await db.bulkProductItem.updateMany({ where: { ...own, id: body.id }, data: body.patch });
  else if (body.op === "bulk") await db.bulkProductItem.updateMany({ where: { ...own, id: { in: body.ids } }, data: body.patch });
  else if (body.op === "remove") await db.bulkProductItem.updateMany({ where: { ...own, id: { in: body.ids } }, data: { removed: true } });
  else if (body.op === "dismiss") await db.bulkProductSession.update({ where: { id: session.id }, data: { dismissed: { push: body.key } } });
  else if (body.op === "join") {
    if (body.kind === "colours" && role !== "seller") return apiError("BAD_REQUEST", "Supplier products don't have colour options yet. Keep them as separate products.");
    const items = await sessionItems(session.id);
    const numbers = items.filter((item) => body.ids.includes(item.id)).map((item) => item.number);
    const joined = joinItems(items, numbers, body.kind);
    if (!joined) return apiError("BAD_REQUEST", "Pick at least two products to join.");
    const { keep, removed } = joined;
    await db.$transaction([
      db.bulkProductItem.update({ where: { id: keep.id }, data: { name: keep.name, photos: keep.photos, colours: keep.colours, priceKobo: keep.priceKobo, stock: keep.stock } }),
      db.bulkProductItem.updateMany({ where: { ...own, number: { in: removed } }, data: { removed: true } }),
    ]);
  } else if (body.op === "split") {
    // Each extra photo becomes its own product again (new numbers at the end).
    const item = await db.bulkProductItem.findFirst({ where: { ...own, id: body.id, removed: false } });
    if (!item || item.photos.length < 2) return apiError("BAD_REQUEST", "This product has one photo.");
    for (const [index, photo] of item.photos.slice(1).entries()) await addPhotoItem(session.id, { clientKey: `${item.clientKey}:split:${index}:${photo.slice(-24)}`, fileName: null, url: photo });
    await db.bulkProductItem.update({ where: { id: item.id }, data: { photos: item.photos.slice(0, 1), colours: [] } });
  }
  await db.bulkProductSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
  const fresh = await findSession(user.id, session.id);
  return ok(fresh ? await sessionView(fresh) : null);
});

const PublishSchema = z.object({ live: z.boolean().default(true), ids: z.array(z.string().min(1).max(60)).max(300).optional() });

export const publishHandler = withBulk(async (req, { user, params, role }) => {
  const session = await ownSession(user.id, params.id);
  if (!session) return notFound();
  const parsed = PublishSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the details and try again.");
  const outcome = await publishChunk({ id: session.id, userId: user.id, role }, { live: parsed.data.live, only: parsed.data.ids });
  if (outcome.busy) return apiError("BUSY", "Already adding these. One moment.", 409);
  if (outcome.blocked === "NO_STORE") return apiError("NOT_FOUND", "Set up your shop first.", 404);
  if (outcome.blocked === "NO_SUPPLIER") return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (outcome.blocked === "ONBOARDING_REQUIRED") return apiError("ONBOARDING_REQUIRED", "Finish setting up your supplier profile before adding products.", 403);
  const fresh = await findSession(user.id, session.id);
  return ok({ ...outcome, session: fresh ? await sessionView(fresh) : null });
});
