import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { riderRating, riderThread, sendRiderMessage } from "@/lib/logistics/rider-messages.server";
import { partnerForUser } from "../../../_shared";

export const dynamic = "force-dynamic";

// The delivery company's chat with one of its riders (shared/rider-chat.ts).
//   GET  → { messages, rating }  (the rider's unread messages are marked read)
//   POST { body } → { message }

export const GET = withLogistics(async (_req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const riderId = String(params.id);
  const messages = await riderThread({ kind: "company", userId: user.id, partnerId: partner.id }, { audience: "company", riderId });
  if (!messages) return apiError("NOT_FOUND", "We couldn't find that rider. Pull down to refresh.", 404);
  return ok({ messages, rating: await riderRating(riderId) });
});

export const POST = withLogistics(async (req: NextRequest, { user, params }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const result = await sendRiderMessage({ kind: "company", userId: user.id, partnerId: partner.id }, { audience: "company", riderId: String(params.id), body: body?.body });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ message: result.message });
});
