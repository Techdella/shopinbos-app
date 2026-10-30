import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { riderThread, sendRiderMessage, shopRiderJob } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// The shop's chat with the rider carrying one of its delivery jobs (shared/rider-chat.ts). Only once a rider has it.
//   GET  → { messages, job } (job: the rider, the delivery status and the order, for the chat's header)
//   POST { body } → { message }

export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  const [messages, job] = await Promise.all([
    riderThread({ kind: "shop", userId: user.id }, { audience: "shop", bookingId: String(params.id) }),
    shopRiderJob(user.id, String(params.id)).catch(() => null),
  ]);
  if (!messages) return apiError("NOT_FOUND", "You can message the rider once one has this delivery.", 404);
  return ok({ messages, job });
});

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const result = await sendRiderMessage({ kind: "shop", userId: user.id }, { audience: "shop", bookingId: String(params.id), body: body?.body });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ message: result.message });
});
