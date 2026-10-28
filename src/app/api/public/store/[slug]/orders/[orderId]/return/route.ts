import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { overPublicLimit } from "@/lib/rate-limit";
import { requestReturn } from "@/lib/faults/returns.server";
import { RETURN_REASONS } from "@shared/fault-matrix";

// "Return it" on the store's order page, when the store takes returns and it's within the window (shared/fault-matrix.ts
// row 6). The seller approves; the trip back is booked; once it's back the refund follows. Access matches the order
// page (the order's unguessable id).
//   POST { reason: changed_mind | doesnt_fit | not_as_expected, message?, photos?: string[] (from …/photos) }

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  reason: z.enum(RETURN_REASONS, { message: "Pick why you're returning it." }),
  message: z.string().trim().max(1000).optional(),
  photos: z.array(z.string().url().max(1000)).max(4).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  if (await overPublicLimit(req.headers, "form")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug, orderId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !orderId || orderId.length > 64) return withCors(req, apiError("BAD_REQUEST", parsed.success ? "We couldn't find this order." : parsed.error.issues[0]?.message ?? "Pick why you're returning it."), CORS);
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const result = await requestReturn(store.id, orderId, parsed.data);
  if (!result.ok) return withCors(req, apiError("BAD_REQUEST", result.error), CORS);
  return withCors(req, ok({ id: result.id }), CORS);
}
