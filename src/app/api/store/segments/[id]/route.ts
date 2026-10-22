import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { parseBody } from "@/lib/api/validate";
import { CustomerSegmentUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { MarketingError, deleteSegment, updateSegment } from "@/lib/marketing/segments";

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const segment = await db.customerSegment.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!segment) return apiError("NOT_FOUND", "Segment not found", 404);

  return ok(segment);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.customerSegment.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Segment not found", 404);

  const parsed = await parseBody(CustomerSegmentUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  try {
    return ok(await updateSegment(store.id, params.id, parsed.data));
  } catch (error) {
    if (error instanceof MarketingError) return apiError("BAD_REQUEST", error.message, 400);
    throw error;
  }
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.customerSegment.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Segment not found", 404);

  try {
    // Refuses while a scheduled or sending campaign uses the segment.
    await deleteSegment(store.id, params.id);
  } catch (error) {
    if (error instanceof MarketingError) return apiError("CONFLICT", error.message, 409);
    throw error;
  }

  return noContent();
});
