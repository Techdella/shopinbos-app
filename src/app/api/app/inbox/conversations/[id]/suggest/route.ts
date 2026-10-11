import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { sellerStore } from "@/lib/inbox/auth";
import { draftReplyWithPeggy } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Peggy drafts a reply into the box. Nothing is sent until the seller presses Send.
export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const conversation = await db.inboxConversation.findFirst({ where: { id: String(params.id), storeId: store.id }, select: { id: true } });
  if (!conversation) return apiError("NOT_FOUND", "Conversation not found", 404);
  const body = (await req.json().catch(() => ({}))) as { instruction?: unknown };
  const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 300) : null;

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;
  const text = await draftReplyWithPeggy(store.id, conversation.id, { instruction });
  if (!text) return apiError("UNAVAILABLE", "Peggy couldn't write a reply just now. Check that an AI key is set, or try again.", 503);
  return ok({ text });
});
