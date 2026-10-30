import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { loadSellerBrandContext } from "@/lib/ai/brand-context.server";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { creditBalance } from "@/lib/ai/credits.server";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { BANNER_COPY_SYSTEM, BANNER_VIBES, bannerCopyPrompt, bannerImagePrompt, parseBannerCopy, type BannerBrief } from "@shared/store-banner";
import { overLimit, readJson, writerLanguage } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

// "Build it with Rex" in the phone's Edit my shop › Banner (apps/mobile/src/components/seller/BannerEditor.tsx).
//   POST { prompt?, vibe?, picture?, language? }
//     → { options: [{ heading, text, button }] (up to 3), imageUrl: string | null, pictureProblem: string | null, creditsLeft }
// Rex writes three sets of banner words (in the phone's language) and, unless picture is false, makes one wide banner
// picture with the same picture maker as Rex Studio (makeBrandImage: the seller's colours and feel). Metered like the
// rest of Rex: the words are one "text", the picture one "photo" (the day's allowance, then AI credits; out of both →
// 402 AI_CREDITS_NEEDED, which the phone words store-safely). A part that fails is given back. Saves nothing: the
// seller picks and the phone saves through PATCH /api/store/editor, as the web builder does. With `clientKey` it is a
// Rex job (src/lib/ai/rex-jobs.server.ts): kept if the seller leaves the screen, replayed without a second charge,
// 202 { data: { pending, rexJobId } } while Rex is still working.

const Body = z.object({
  prompt: z.string().trim().max(300, "Keep it under 300 characters.").optional().default(""),
  vibe: z.enum(BANNER_VIBES.map((vibe) => vibe.id) as [string, ...string[]]).nullable().optional(),
  picture: z.boolean().optional().default(true),
  language: z.string().max(8).optional(),
  clientKey: z.string().max(80).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const input = await readJson(req, Body);
  if (input instanceof NextResponse) return input;
  if (!input.prompt && !input.vibe) return apiError("BAD_REQUEST", "Pick a feel or say what the banner is for.", 400);
  if (!aiConfigured()) return apiError("AI_OFF", "Rex isn't switched on yet.", 503);
  const limited = await overLimit("mobile-banner", user.id, 20);
  if (limited) return limited;

  const job = await runRexJob({ user, kind: "banner", clientKey: input.clientKey, input: { prompt: input.prompt, vibe: input.vibe ?? null, picture: input.picture } }, async (rex) => {
    const wordsCredits = await rex.charge("text", 1);
    const pictureCredits = input.picture ? await rex.charge("image", 1, "photo") : null;

    const brand = await loadSellerBrandContext(user.id).catch(() => null);
    const brief: BannerBrief = {
      storeName: brand?.storeName ?? "the shop",
      business: brand?.business ?? null,
      category: brand?.category ?? null,
      audience: brand?.audience ?? null,
      vibe: (input.vibe as BannerBrief["vibe"]) ?? null,
      prompt: input.prompt,
      language: writerLanguage(input.language),
    };

    const [copy, image] = await Promise.all([
      aiText({ system: BANNER_COPY_SYSTEM, prompt: bannerCopyPrompt(brief), fast: true, maxTokens: 1500 })
        .then((result) => parseBannerCopy(firstJsonObject(result?.text ?? null)))
        .catch(() => []),
      pictureCredits !== null
        ? makeBrandImage({ brand, prompt: bannerImagePrompt(brief), size: "1536x1024", logo: false, colours: true, path: `generated/${user.id}/banner-${Date.now()}` })
            .then((result) => ({ url: result.url, problem: null as string | null }))
            .catch((error: unknown) => ({ url: null, problem: error instanceof Error ? error.message : "picture" }))
        : Promise.resolve(null),
    ]);

    // Nothing came back: the job fails and gives back everything it took.
    if (!copy.length && !image?.url) throw new Error("Rex couldn't make a banner just now.");
    // A part that didn't come back is given back (the credits and the day's cap).
    if (!copy.length) await rex.refund("text", 1, wordsCredits);
    if (pictureCredits !== null && !image?.url) await rex.refund("image", 1, pictureCredits);
    if (image?.problem) console.error("[mobile/banner] picture failed", image.problem);
    return {
      options: copy,
      imageUrl: image?.url ?? null,
      pictureProblem: pictureCredits !== null && !image?.url ? "Rex couldn't make the picture this time; the words are ready." : null,
    };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return ok(rexPendingBody(job.jobId), 202);
  if (job.status === "failed") return apiError("UNAVAILABLE", "Rex couldn't make a banner just now. Try again in a moment.", 503);
  return ok({ ...job.result, creditsLeft: await creditBalance(user.id).catch(() => null), rexJobId: job.jobId, resumed: job.replayed });
});
