import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { deleteAiChat, getAiChat } from "@/lib/ai/chats.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One saved Rex or Peggy chat: GET to reopen it, DELETE to remove it. Only your own.

export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const chat = await getAiChat(user.id, String(params.id ?? ""));
  return chat ? ok(chat) : apiError("NOT_FOUND", "That chat isn't there any more.", 404);
});

export const DELETE = withAuth(async (_req: NextRequest, { user, params }) => {
  return (await deleteAiChat(user.id, String(params.id ?? ""))) ? ok({ deleted: true }) : apiError("NOT_FOUND", "That chat isn't there any more.", 404);
});
