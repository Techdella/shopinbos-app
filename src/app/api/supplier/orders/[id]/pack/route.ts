import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { dropshipPackView, savePackProgress } from "@/lib/supplier-dropship.server";
import { markPacked } from "@/lib/supplier-orders/pickup.server";

export const dynamic = "force-dynamic";

// Pack it the seller's way, on one of the supplier's dropship orders (web portal and the phone app).
//   GET  → { data: PackView } the seller's name and logo, the branding (blind | packing_slip | stickers, fee), the
//          seller's SKUs, the checklist steps (each { id, text, detail, done }), the photo, stickers left, problem.
//   POST { steps?: string[], photoUrl?: string | null, packed?: true } ticks steps ("plain" | "slip" | "sticker" |
//          "code") and saves the sealed-parcel photo (upload it first: POST /api/app/media). With packed: true it
//          then marks the order packed; that refuses with 400 (packReadyProblem's words) until every step is
//          ticked and the photo exists. Answers with the PackView.

async function supplierIdFor(userId: string) {
  return (await db.supplier.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
}

const statusOf = (code: string) => (code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400);

export const GET = withSupplier(async (_req: NextRequest, { user, params }) => {
  const supplierId = await supplierIdFor(user.id);
  if (!supplierId) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const view = await dropshipPackView(supplierId, String(params.id));
  if (!view) return apiError("NOT_FOUND", "Order not found", 404);
  return ok(view);
});

export const POST = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplierId = await supplierIdFor(user.id);
  if (!supplierId) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const body = (await req.json().catch(() => null)) as { steps?: unknown; photoUrl?: unknown; packed?: unknown } | null;
  if (!body || typeof body !== "object") return apiError("BAD_REQUEST", "Send the steps you've done or the parcel photo.");
  const id = String(params.id);
  if (body.steps !== undefined || body.photoUrl !== undefined) {
    const saved = await savePackProgress(supplierId, id, { steps: body.steps, photoUrl: body.photoUrl });
    if (!saved.ok) return apiError(saved.code, saved.message, statusOf(saved.code));
  }
  if (body.packed === true) {
    const packed = await markPacked(supplierId, "dropship", id);
    if (!packed.ok) return apiError(packed.code, packed.message, statusOf(packed.code));
  }
  const view = await dropshipPackView(supplierId, id);
  if (!view) return apiError("NOT_FOUND", "Order not found", 404);
  return ok(view);
});
