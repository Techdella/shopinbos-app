import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { listDesigns, saveLabelDesign, savePackagingDesign } from "@/lib/packaging/designs.server";
import { cleanDesign } from "@shared/packaging";
import { isPrintKind } from "@shared/print-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Labels and print: GET lists saved designs; POST saves a packaging design (new, or over `id`) or a Print studio
// setup ({ kind: "label", printKind, href, title }).
const Body = z.union([
  z.object({ kind: z.literal("packaging"), id: z.string().max(64).nullable().optional(), title: z.string().trim().max(80), design: z.unknown() }),
  z.object({ kind: z.literal("label"), printKind: z.string(), title: z.string().trim().max(80), href: z.string().max(1500).startsWith("/home/labels/studio"), productId: z.string().max(64).nullable().optional() }),
]);

async function storeOf(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true } });
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(await listDesigns(store.id));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Couldn't read that design.");
  const body = parsed.data;
  if (body.kind === "packaging") {
    const row = await savePackagingDesign({ storeId: store.id, userId: user.id, id: body.id, title: body.title, design: cleanDesign(body.design) });
    return ok({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() });
  }
  if (!isPrintKind(body.printKind)) return apiError("BAD_REQUEST", "Unknown label type.");
  const row = await saveLabelDesign({ storeId: store.id, userId: user.id, title: body.title, kind: body.printKind, href: body.href, productId: body.productId ?? null });
  return ok({ id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() });
});
