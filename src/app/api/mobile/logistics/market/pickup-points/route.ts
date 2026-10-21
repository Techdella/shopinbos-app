import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { savePickupPoint } from "@/lib/delivery-market/manage.server";
import { partnerFor } from "../_guard";

export const dynamic = "force-dynamic";

// POST /api/mobile/logistics/market/pickup-points { name, address, state, area, hours, phone, lat?, lng? }: add one.
export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const found = await partnerFor(user.id, "setup");
  if ("error" in found) return found.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("BAD_REQUEST", "Fill in the pickup point first.");
  const result = await savePickupPoint(found.partner.id, null, { name: body.name, address: body.address, state: body.state, area: body.area, hours: body.hours, phone: body.phone, lat: body.lat ?? "", lng: body.lng ?? "" });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ saved: true });
});
