import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachmentProblem, safeFileName, type AttachmentRef } from "@/lib/conversations/pure";
import { accessOrStart, detailsReady } from "@/lib/conversations/service.server";
import { MESSAGING_ROLES, conversationError } from "@/lib/conversations/http";
import { UploadRejectedError, uploadPrivateFile } from "@/lib/supabase/storage.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Upload a photo or PDF for a partner message (multipart "file"). Stored under messages/<conversationId>/;
// the message then carries { path, name, type, size } and is only served back to the two people in the chat.
export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    if (!checkRateLimit(`partner-file:${user.id}`, { maxRequests: 20, windowMs: 60_000 }).allowed) {
      return apiError("RATE_LIMITED", "Too many uploads. Wait a moment and try again.", 429);
    }
    if (!(await detailsReady())) return apiError("NOT_READY", "Sending files needs a quick database update first.", 503);
    const access = await accessOrStart(user, String(params.id), true);
    if (!access) return apiError("NOT_FOUND", "Conversation not found.", 404);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return apiError("BAD_REQUEST", "Choose a file to send.");
    const problem = attachmentProblem(file);
    if (problem) return apiError("BAD_REQUEST", problem);

    const { path } = await uploadPrivateFile(`messages/${access.id}`, file);
    const data: AttachmentRef & { conversationId: string } = { path, name: safeFileName(file.name), type: file.type, size: file.size, conversationId: access.id };
    return ok(data, 201);
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", error.message);
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);
