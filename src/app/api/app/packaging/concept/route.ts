import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { ImageUnavailableError } from "@/lib/ai/images";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { makePackConcept } from "@/lib/packaging/concept.server";
import { MAX_PACK_VARIANTS, PACK_CONCEPTS, PACK_SCENES, PACK_SHAPES } from "@shared/pack-concepts";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z.object({
  concept: z.enum(PACK_CONCEPTS),
  shape: z.enum(PACK_SHAPES).nullable().optional(),
  scene: z.enum(PACK_SCENES).nullable().optional(),
  name: z.string().trim().min(1).max(80),
  productId: z.string().max(64).nullable().optional(),
  productKind: z.string().trim().max(40).nullable().optional(),
  variants: z.array(z.string().trim().max(40)).max(MAX_PACK_VARIANTS).nullable().optional(),
  tagline: z.string().trim().max(60).nullable().optional(),
  brief: z.string().trim().max(400).nullable().optional(),
  useLogo: z.boolean().optional(),
  clientKey: z.string().max(80).optional(),
});

// "Premium AI packaging" in the packaging designer: a photoreal render of the finished pack (or the range) in one
// of the concepts. Costs one picture; a failed render is given back. With `clientKey` it is a Rex job
// (src/lib/ai/rex-jobs.server.ts): saved if the seller leaves, replayed without a second charge, 202 while drawing.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick a concept and name the product first.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const body = parsed.data;
  const product = body.productId ? await db.storeProduct.findFirst({ where: { id: body.productId, storeId: store.id }, select: { images: true } }) : null;

  const job = await runRexJob({ user, kind: "packaging", clientKey: body.clientKey, storeId: store.id, input: { concept: body.concept, shape: body.shape ?? null, scene: body.scene ?? null, name: body.name, brief: body.brief ?? null } }, async (rex) => {
    await rex.charge("image", 1, "photo");
    const brand = await loadBrandContext(store.id);
    const result = await makePackConcept({
      brand,
      userId: user.id,
      logo: body.useLogo !== false,
      productPhotos: product?.images ?? [],
      input: { concept: body.concept, shape: body.shape ?? null, scene: body.scene ?? null, productName: body.name, productKind: body.productKind ?? null, variants: body.variants ?? null, tagline: body.tagline ?? null, extra: body.brief ?? null },
    });
    return { url: result.url, shape: result.shape, concept: body.concept, usedLogo: result.usedLogo, logoProblem: result.logoProblem };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "done") return ok({ ...job.result, rexJobId: job.jobId, resumed: job.replayed });
  // The render's picture was given back.
  if (job.error instanceof ImageUnavailableError) return apiError("AI_UNAVAILABLE", job.error.message, 503);
  console.error("[packaging/concept] render failed", job.error);
  return apiError("GENERATION_FAILED", "Rex couldn't draw that pack just now. Try again in a moment.", 500);
});
