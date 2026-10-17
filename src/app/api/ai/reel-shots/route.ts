import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { ImageUnavailableError, isOwnImageUrl } from "@/lib/ai/images";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { makeReelShot } from "@/lib/ai/reel-shots.server";
import { REEL_SHOT_LOOKS } from "@shared/video-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Schema = z.object({
  photos: z.array(z.string().trim().max(2000)).min(1).max(6),
  look: z.enum(REEL_SHOT_LOOKS),
  product: z.string().trim().max(160).optional(),
});

// Video studio "Make shots with Rex": each product photo comes back cleaned up for the reel: cut out (see-through
// background, for the floating templates), on a clean studio backdrop in the brand's colours, or as a branded ad
// shot with the logo. Each picture is metered as an image (allowance, then credits).
export const POST = withSeller(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Pick the photos first.");
  const { photos, look, product } = parsed.data;
  if (photos.some((url) => !isOwnImageUrl(url))) return apiError("BAD_REQUEST", "Use photos saved in your shop (product photos or ones you uploaded here).");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const brand = await loadBrandContext(store.id);

  const results: Array<{ source: string; url: string | null; error?: string }> = [];
  // Two at a time: fast enough, and a failure part-way still returns the shots already made.
  for (let i = 0; i < photos.length; i += 2) {
    const batch = photos.slice(i, i + 2);
    const done = await Promise.all(
      batch.map(async (source, j) => {
        const limited = await meterAi(user.id, "image");
        if (limited) {
          const body = (await limited.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          return { source, url: null, error: body?.error?.message ?? "Out of pictures for today.", code: body?.error?.code };
        }
        try {
          const url = await makeReelShot({ userId: user.id, source, look, product: product ?? null, brand, n: i + j });
          return { source, url };
        } catch (error) {
          if (error instanceof ImageUnavailableError) return { source, url: null, error: error.message };
          console.error("[reel-shots] failed", error);
          return { source, url: null, error: "That photo didn't come back. Try again." };
        }
      }),
    );
    results.push(...done);
    const stop = done.find((item) => "code" in item && item.code === "AI_CREDITS_NEEDED");
    if (stop) return ok({ shots: results, creditsNeeded: true, message: stop.error });
  }
  return ok({ shots: results, creditsNeeded: false });
});
