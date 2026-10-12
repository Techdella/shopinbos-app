import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { attachmentFor } from "@/lib/conversations/service.server";
import { MESSAGING_ROLES, conversationError } from "@/lib/conversations/http";
import { getSignedUrl } from "@/lib/supabase/storage.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Opens a message attachment: checks the viewer is in the chat, then redirects to a short-lived signed URL.
export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const index = Number(params.index);
    if (!Number.isInteger(index) || index < 0) return apiError("NOT_FOUND", "File not found.", 404);
    const file = await attachmentFor(user, String(params.id), String(params.messageId), index);
    if (!file) return apiError("NOT_FOUND", "File not found.", 404);
    const url = await getSignedUrl(file.path, 600);
    const response = NextResponse.redirect(url, 302);
    response.headers.set("Cache-Control", "private, max-age=300");
    return response;
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);
