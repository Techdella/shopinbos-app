import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { normaliseAutoReply, normaliseChatbot } from "@/lib/inbox/assistant";
import { sellerStore } from "@/lib/inbox/auth";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { chatbotAnswer } from "@/lib/inbox/chatbot.server";

export const dynamic = "force-dynamic";

// "Test the chatbot" on the settings page: the seller chats with Peggy using the settings on screen (saved or
// not). Nothing is stored and no customer sees it.
const BodySchema = z.object({
  chatbot: z.record(z.string(), z.unknown()),
  messages: z.array(z.object({ from: z.enum(["shopper", "shop"]), body: z.string().trim().min(1).max(1200) })).min(1).max(20),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Write a message first");
  const limited = await meterAi(user.id, "text", 1, "chat_reply");
  if (limited) return limited;
  const saved = await loadAutomation(store.id);
  const answer = await chatbotAnswer(store.id, normaliseChatbot({ ...parsed.data.chatbot, enabled: true }), normaliseAutoReply(saved.autoReply), parsed.data.messages);
  return ok(answer);
});
