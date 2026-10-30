import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { creditBalance } from "@/lib/ai/credits.server";
import { EDIT_PROMPTS, editImage, ImageUnavailableError, isOwnImageUrl } from "@/lib/ai/images";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { overLimit, readJson } from "../../banner/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Onboarding D1a "Clean white backgrounds": after Rex writes the products from their photos, the seller can ask for
// the photos on a clean white background, all at once or one by one. Never automatic: the phone shows what it costs
// (GET /api/mobile/onboarding credits.bgRemove, per photo) and asks before the first one is charged.
//   POST { action: "clean", productId, clientKey? } → { productId, url, previous, creditsLeft }
//        The product's main photo on a white studio background (OpenAI's image edit, the same path as the editor's
//        Remove background and Rex's tools), priced as one bg_remove. A Rex job: if the seller loses signal the photo
//        is still made and put on the product, a retry doesn't pay twice, 202 { pending, rexJobId } means still
//        working, and a failure gives the credits back. The old photo stays in storage (`previous`) for Undo.
//   POST { action: "restore", productId, url } → { productId, url }
//        Undo: puts a photo back as the product's main photo (free). Only a photo in our own storage.
// Only the seller's own products (staff act as the owner).

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clean"), productId: z.string().min(1).max(60), clientKey: z.string().max(80).optional() }),
  z.object({ action: z.literal("restore"), productId: z.string().min(1).max(60), url: z.string().url().max(2000) }),
]);

async function ownProduct(userId: string, productId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return null;
  return db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true, images: true } });
}

/** The product's photos with `url` as the main one (the old main photo is replaced, the rest stay). */
const withMain = (images: string[], url: string) => [url, ...images.slice(1).filter((image) => image !== url)];

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const input = await readJson(req, Body);
  if (input instanceof NextResponse) return input;
  const product = await ownProduct(user.id, input.productId);
  if (!product) return apiError("NOT_FOUND", "That product isn't in your shop.", 404);

  if (input.action === "restore") {
    if (!isOwnImageUrl(input.url)) return apiError("BAD_REQUEST", "That photo can't be put back.", 400);
    await db.storeProduct.update({ where: { id: product.id }, data: { images: withMain(product.images, input.url) } });
    return ok({ productId: product.id, url: input.url });
  }

  const source = product.images[0];
  if (!source) return apiError("BAD_REQUEST", "Add a photo to this product first.", 400);
  if (!isOwnImageUrl(source)) return apiError("BAD_REQUEST", "This photo isn't in your shop's storage, so Rex can't clean it.", 400);
  if (!aiConfigured() || !getOpenAIClient()) return apiError("AI_OFF", "Rex's pictures aren't switched on yet.", 503);
  const limited = await overLimit("onboarding-clean-photo", user.id, 40);
  if (limited) return limited;

  const job = await runRexJob({ user, kind: "image", clientKey: input.clientKey, input: { tool: "onboarding-clean", productId: product.id, source } }, async (rex) => {
    await rex.charge("image", 1, "bg_remove");
    const url = await editImage({ sourceUrl: source, prompt: EDIT_PROMPTS.white_background, path: `enhanced/${user.id}/clean-${Date.now()}` });
    // Put on the product here, so a photo finished after the seller left still lands in the shop.
    const fresh = await db.storeProduct.findUnique({ where: { id: product.id }, select: { images: true } });
    if (fresh && fresh.images[0] === source) await db.storeProduct.update({ where: { id: product.id }, data: { images: withMain(fresh.images, url) } });
    return { productId: product.id, url, previous: source };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") {
    const off = job.error instanceof ImageUnavailableError;
    return apiError(off ? "AI_OFF" : "UNAVAILABLE", off ? "Rex's pictures aren't switched on yet." : "Rex couldn't clean that photo just now. Nothing was charged; try again.", 503);
  }
  return ok({ ...job.result, creditsLeft: await creditBalance(user.id).catch(() => null), rexJobId: job.jobId, resumed: job.replayed });
});
