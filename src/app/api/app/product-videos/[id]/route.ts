import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { VideoInputProblem, removeProductVideo, updateProductVideo } from "@/lib/product-videos/service.server";
import { videoId } from "@shared/product-videos";
import { withVideoOwner } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One product video of the signed-in seller or supplier (post_to_plug on).
// PATCH { caption?, showOnDiscover?, status?: "active" | "hidden" } → { data: video }
// DELETE → { data: { removed: true } } (kept as "removed"; an uploaded file is deleted, a Rex reel's file stays)

const Patch = z.object({
  caption: z.string().max(1000).nullish(),
  showOnDiscover: z.boolean().nullish(),
  status: z.enum(["active", "hidden"]).nullish(),
});

export const PATCH = withVideoOwner(async (req: NextRequest, { owner, params }) => {
  const id = videoId(params.id);
  if (!id) return apiError("NOT_FOUND", "Video not found.", 404);
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Nothing to change.");
  try {
    const video = await updateProductVideo(owner, id, parsed.data);
    return video ? ok(video) : apiError("NOT_FOUND", "Video not found.", 404);
  } catch (error) {
    if (error instanceof VideoInputProblem) return apiError(error.code, error.message, error.status);
    throw error;
  }
});

export const DELETE = withVideoOwner(async (_req: NextRequest, { owner, params }) => {
  const id = videoId(params.id);
  if (!id || !(await removeProductVideo(owner, id))) return apiError("NOT_FOUND", "Video not found.", 404);
  return ok({ removed: true });
});
