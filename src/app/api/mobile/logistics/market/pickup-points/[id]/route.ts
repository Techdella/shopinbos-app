import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { removePickupPoint, savePickupPoint } from "@/lib/delivery-market/manage.server";
import { partnerFor } from "../../_guard";

export const dynamic = "force-dynamic";

// PATCH /api/mobile/logistics/market/pickup-points/[id] (same fields as POST) edits a pickup point; DELETE removes it.
export const PATCH = withLogistics(async (req: NextRequest, { user, params }) => {
  const found = await partnerFor(user.id, "setup");
  if ("error" in found) return found.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("BAD_REQUEST", "Fill in the pickup point first.");
  const result = await savePickupPoint(found.partner.id, String(params.id), { name: body.name, address: body.address, state: body.state, area: body.area, hours: body.hours, phone: body.phone, lat: body.lat ?? "", lng: body.lng ?? "" });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ saved: true });
});

export const DELETE = withLogistics(async (_req: NextRequest, { user, params }) => {
  const found = await partnerFor(user.id, "setup");
  if ("error" in found) return found.error;
  const result = await removePickupPoint(found.partner.id, String(params.id));
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ removed: true });
});
