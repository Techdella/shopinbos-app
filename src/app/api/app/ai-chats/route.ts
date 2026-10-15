import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { listAiChats, saveAiChat } from "@/lib/ai/chats.server";
import { isAiChatAssistant, parseAiChatSave } from "@shared/ai-chats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rex and Peggy chat history. GET ?assistant=rex|peggy lists your saved chats; PUT { id?, assistant, messages }
// saves one (returns its id). One chat: /api/app/ai-chats/[id].

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const assistant = req.nextUrl.searchParams.get("assistant");
  if (!isAiChatAssistant(assistant)) return apiError("BAD_REQUEST", "Say whose chats to list.");
  return ok(await listAiChats(user.id, assistant));
});

export const PUT = withAuth(async (req: NextRequest, { user }) => {
  const parsed = parseAiChatSave(await req.json().catch(() => null));
  if (!parsed.ok) return apiError("BAD_REQUEST", parsed.error);
  return ok(await saveAiChat(user.id, parsed.save));
});
