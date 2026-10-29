import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { ShippingZoneUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

async function getOwnedZone(zoneId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.shippingZone.findUnique({ where: { id: zoneId, storeId: store.id } });
}

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const zone = await getOwnedZone(params.id, user.id);
  if (!zone) return apiError("NOT_FOUND", "Shipping zone not found", 404);
  return ok(zone);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const zone = await getOwnedZone(params.id, user.id);
  if (!zone) return apiError("NOT_FOUND", "Shipping zone not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = ShippingZoneUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updated = await db.shippingZone.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return ok(updated);
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const zone = await getOwnedZone(params.id, user.id);
  if (!zone) return apiError("NOT_FOUND", "Shipping zone not found", 404);

  await db.shippingZone.delete({ where: { id: params.id } });
  return noContent();
});
