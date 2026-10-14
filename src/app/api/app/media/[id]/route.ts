import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { hideMedia } from "@/lib/media/library.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/app/media/[id]: takes a picture out of the person's own library. It is only hidden, never deleted
// from storage, so products, pages and emails that already show it keep working. Someone else's id is "not found".
export const DELETE = withAuth(async (_req, { user, params }) => {
  const id = typeof params?.id === "string" ? params.id.slice(0, 64) : "";
  if (!id) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
  const hidden = await hideMedia(user.id, id).catch(() => false);
  if (!hidden) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
  return ok({ id, hidden: true });
});
