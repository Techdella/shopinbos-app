import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { addNote, sendReply } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({ body: z.string().trim().min(1, "Write a message first").max(4000), mode: z.enum(["reply", "note"]).default("reply") }).strict();

// Reply on the conversation's own channel, or add a private note.
export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid message");

  if (parsed.data.mode === "note") {
    const note = await addNote({ storeId: store.id, conversationId: String(params.id), body: parsed.data.body, authorName: user.name ?? "You" });
    if (!note) return apiError("NOT_FOUND", "Conversation not found", 404);
    return ok({ id: note.id, status: note.status });
  }

  const result = await sendReply({ storeId: store.id, conversationId: String(params.id), body: parsed.data.body, authorName: user.name ?? "You" });
  if (!result.ok && !result.message) return apiError("NOT_FOUND", result.error, 404);
  // A failed send is still saved (marked failed) so the seller sees why; report it as an error too.
  if (!result.ok) return apiError("SEND_FAILED", result.error, 502);
  return ok({ id: result.message.id, status: result.message.status });
});
