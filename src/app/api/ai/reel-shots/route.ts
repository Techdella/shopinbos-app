import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { RexJobBlocked, rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { ImageUnavailableError, isOwnImageUrl } from "@/lib/ai/images";
import { noVideoOwnerMessage, videoBrandContext, videoOwnerFor, withVideoMaker } from "@/lib/video/owner.server";
import { makeReelShot } from "@/lib/ai/reel-shots.server";
import { REEL_SHOT_LOOKS } from "@shared/video-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Schema = z.object({
  photos: z.array(z.string().trim().max(2000)).min(1).max(6),
  look: z.enum(REEL_SHOT_LOOKS),
  product: z.string().trim().max(160).optional(),
  clientKey: z.string().max(80).optional(),
});

// Video studio "Make shots with Rex": each product photo comes back cleaned up for the reel: cut out (see-through
// background, for the floating templates), on a clean studio backdrop in the brand's colours, or as a branded ad
// shot with the logo. Each picture is metered as an image (allowance, then credits). Delivery partners too: their
// brand is their LogisticsPartner name and logo (src/lib/video/owner.server.ts). A shot that doesn't come back is given
// back. With `clientKey` it is a Rex job (src/lib/ai/rex-jobs.server.ts): the shots are kept if the seller leaves,
// a retry gets them free, and 202 { data: { pending, rexJobId } } means Rex is still making them.
export const POST = withVideoMaker(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick the photos first.");
  const { photos, look, product } = parsed.data;
  if (photos.some((url) => !isOwnImageUrl(url))) return apiError("BAD_REQUEST", "Use photos you uploaded here or saved in your media.");
  const owner = await videoOwnerFor(user);
  if (!owner) return apiError("NOT_FOUND", noVideoOwnerMessage(user.role), 404);
  const brand = await videoBrandContext(owner);

  const job = await runRexJob({ user, kind: "reel_shots", clientKey: parsed.data.clientKey, input: { photos: photos.length, look, product: product ?? null } }, async (rex) => {
    const results: Array<{ source: string; url: string | null; error?: string }> = [];
    // Two at a time: fast enough, and a failure part-way still returns the shots already made.
    for (let i = 0; i < photos.length; i += 2) {
      const batch = photos.slice(i, i + 2);
      const done = await Promise.all(
        batch.map(async (source, j) => {
          let credits = 0;
          try {
            credits = await rex.charge("image");
          } catch (error) {
            if (!(error instanceof RexJobBlocked)) throw error;
            const body = (await error.response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
            return { source, url: null, error: body?.error?.message ?? "Out of pictures for today.", code: body?.error?.code };
          }
          try {
            const url = await makeReelShot({ userId: user.id, source, look, product: product ?? null, brand, n: i + j });
            return { source, url };
          } catch (error) {
            await rex.refund("image", 1, credits);
            if (error instanceof ImageUnavailableError) return { source, url: null, error: error.message };
            console.error("[reel-shots] failed", error);
            return { source, url: null, error: "That photo didn't come back. Try again." };
          }
        }),
      );
      results.push(...done.map(({ source, url, error }) => ({ source, url, ...(error ? { error } : {}) })));
      const stop = done.find((item) => "code" in item && item.code === "AI_CREDITS_NEEDED");
      if (stop) return { shots: results, creditsNeeded: true, message: stop.error };
    }
    return { shots: results, creditsNeeded: false };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") return apiError("UNAVAILABLE", "Rex couldn't make the shots just now. Try again in a moment.", 503);
  return ok({ ...job.result, rexJobId: job.jobId, resumed: job.replayed });
});
