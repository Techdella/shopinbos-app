import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { riderThread, sendRiderMessage } from "@/lib/logistics/rider-messages.server";

export const dynamic = "force-dynamic";

// The shop's chat with the rider carrying one of its delivery jobs (shared/rider-chat.ts). Only once a rider has it.
//   GET  → { messages }
//   POST { body } → { message }

export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  const messages = await riderThread({ kind: "shop", userId: user.id }, { audience: "shop", bookingId: String(params.id) });
  if (!messages) return apiError("NOT_FOUND", "You can message the rider once one has this delivery.", 404);
  return ok({ messages });
});

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const result = await sendRiderMessage({ kind: "shop", userId: user.id }, { audience: "shop", bookingId: String(params.id), body: body?.body });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ message: result.message });
});
