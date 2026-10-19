import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { hideMedia, updateMediaDetails } from "@/lib/media/library.server";
import { MediaDetailsSchema } from "@shared/media-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mediaId(params: unknown) {
  const id = (params as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id.slice(0, 64) : "";
}

// PATCH /api/app/media/[id] { title?, alt? }: renames a picture and / or sets its alt text, on the person's own
// library only (null or "" clears one). → { data: MediaAsset }. Someone else's id is "not found".
export const PATCH = withAuth(async (req, { user, params }) => {
  const id = mediaId(params);
  if (!id) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
  const body = await req.json().catch(() => null);
  const parsed = MediaDetailsSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the title and alt text.", 400);
  try {
    const asset = await updateMediaDetails(user.id, id, parsed.data);
    if (!asset) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
    return ok(asset);
  } catch (error) {
    console.error("[media] details update failed", error);
    return apiError("INTERNAL_ERROR", "Couldn't save that. Try again.", 500);
  }
});

// DELETE /api/app/media/[id]: takes a picture out of the person's own library. It is only hidden, never deleted
// from storage, so products, pages and emails that already show it keep working. Someone else's id is "not found".
export const DELETE = withAuth(async (_req, { user, params }) => {
  const id = mediaId(params);
  if (!id) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
  const hidden = await hideMedia(user.id, id).catch(() => false);
  if (!hidden) return apiError("NOT_FOUND", "That picture isn't in your media.", 404);
  return ok({ id, hidden: true });
});
