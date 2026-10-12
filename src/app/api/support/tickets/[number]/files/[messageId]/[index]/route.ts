import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { parseTicketNumber } from "@/lib/support/pure";
import { attachmentFor } from "@/lib/support/service.server";
import { SUPPORT_ROLES, supportError } from "@/lib/support/http";
import { getSignedUrl } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Opens a support attachment: the ticket's own customer (not internal notes) or an admin, then a short-lived
// signed URL.
export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const number = parseTicketNumber(params.number);
    const index = Number(params.index);
    if (!number || !Number.isInteger(index) || index < 0) return apiError("NOT_FOUND", "File not found.", 404);
    const file = await attachmentFor(user, number, String(params.messageId), index);
    if (!file) return apiError("NOT_FOUND", "File not found.", 404);
    const response = NextResponse.redirect(await getSignedUrl(file.path, 600), 302);
    response.headers.set("Cache-Control", "private, max-age=300");
    return response;
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
