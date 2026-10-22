import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { connectPartner } from "@/lib/delivery-market/manage.server";
import { text, withOwner } from "../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/delivery/connections { partnerId }: "Connect". Instant on the partner's public rates
// (CONNECT_NEEDS_APPROVAL in shared/delivery-market.ts). Connecting signs the Delivery service agreement with
// `signedName`, or the account name from older apps (src/lib/contracts/contracts.server.ts).
export const POST = withOwner(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as { partnerId?: unknown; signedName?: unknown } | null;
  const partnerId = text(body?.partnerId, 40);
  if (!partnerId) return apiError("BAD_REQUEST", "Pick the delivery partner to connect.");
  const result = await connectPartner({ id: user.id, role: user.role, name: user.name }, partnerId, text(body?.signedName, 80) || undefined);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ connectionId: result.data?.connectionId ?? null });
});
