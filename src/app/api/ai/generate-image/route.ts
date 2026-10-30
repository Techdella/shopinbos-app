import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { ImageUnavailableError, isOwnImageUrl, MAX_REFERENCES, normaliseImageSize } from "@/lib/ai/images";
import { loadSellerBrandContext } from "@/lib/ai/brand-context.server";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { aiAllowanceToday } from "@/lib/ai/usage";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";

const ACTION = "photo" as const;
import { db } from "@/lib/db/client";
import { CREATIVE_PLACEMENT_INFO, creativePrompt, isCreativeConcept, isCreativePlacement } from "@shared/creatives";

export const runtime = "nodejs";
export const maxDuration = 180;

const LOOKS: Record<string, string> = {
  vivid: "Look: vivid and punchy, rich colour and crisp contrast.",
  natural: "Look: natural and true to life, soft realistic light.",
};

// Rex Studio "Make image": a prompt in, a stored image URL out. With useLogo the seller's logo goes in as a
// reference so it is reproduced, not invented; useBrand keeps to their colours; referenceUrls are photos (or
// video stills) they uploaded for Rex to work from. With `clientKey` it is a Rex job (src/lib/ai/rex-jobs.server.ts): kept
// if the seller drops off, replayed (no second charge) on a retry, 202 { pending, rexJobId } while still drawing.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; size?: string; style?: string; useLogo?: boolean; useBrand?: boolean; referenceUrls?: unknown; clientKey?: unknown; creative?: { concept?: unknown; placement?: unknown; headline?: unknown; subline?: unknown; cta?: unknown } | null };
  // Creative templates (giant headline, product line-up, witty idea…): the concept and placement shape the prompt,
  // and what the seller typed is extra direction.
  const creative = body.creative && isCreativeConcept(body.creative.concept) && isCreativePlacement(body.creative.placement) ? body.creative : null;
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const typed = body.prompt?.trim() ?? "";
  const prompt = creative
    ? creativePrompt({ concept: creative.concept as Parameters<typeof creativePrompt>[0]["concept"], placement: creative.placement as Parameters<typeof creativePrompt>[0]["placement"], headline: text(creative.headline), subline: text(creative.subline), cta: text(creative.cta), extra: typed || null })
    : typed;
  if (creative) body.size = { square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024" }[CREATIVE_PLACEMENT_INFO[creative.placement as keyof typeof CREATIVE_PLACEMENT_INFO].shape];
  if (!prompt) return NextResponse.json({ error: { code: "missing_prompt", message: "Describe the image you want." } }, { status: 400 });
  if (typed.length > 2000) return NextResponse.json({ error: { code: "too_long", message: "Keep the description under 2,000 characters." } }, { status: 400 });
  const references = Array.isArray(body.referenceUrls) ? body.referenceUrls.filter((url): url is string => typeof url === "string" && isOwnImageUrl(url)).slice(0, MAX_REFERENCES) : [];

  const size = normaliseImageSize(body.size);
  const job = await runRexJob(
    { user, kind: creative ? "flyer" : "image", clientKey: body.clientKey, input: { prompt: typed, creative, size, style: body.style ?? null, useLogo: Boolean(body.useLogo) } },
    async (rex) => {
      await rex.charge("image", 1, ACTION);
      const brand = await loadSellerBrandContext(user.id);
      const look = body.style ? LOOKS[body.style] : undefined;
      const result = await makeBrandImage({
        brand,
        prompt: look ? `${prompt}\n${look}` : prompt,
        size,
        logo: Boolean(body.useLogo),
        colours: body.useBrand !== false,
        referenceUrls: references,
        // Creative templates are finished ads with lettering: render them at full detail.
        quality: creative ? "high" : undefined,
        path: `generated/${user.id}/${Date.now()}`,
      });
      return { image: { url: result.url, size, style: body.style ?? null }, usedLogo: result.usedLogo, usedReferences: result.usedReferences, logoProblem: result.logoProblem };
    },
  );
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return NextResponse.json(rexPendingBody(job.jobId), { status: 202 });
  if (job.status === "failed") {
    // The picture's credits and the day's cap were given back.
    const status = job.error instanceof ImageUnavailableError ? 503 : 500;
    return NextResponse.json({ error: { code: "generation_failed", message: job.message || "Image generation failed" } }, { status });
  }
  const plan = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  const [credits, allowance] = await Promise.all([creditBalance(user.id), aiAllowanceToday(user.id, plan?.aiCredits)]);
  const pictures = allowance?.find((row) => row.kind === "image") ?? null;
  return NextResponse.json({
    ...job.result,
    pictures: pictures ? { used: pictures.used, limit: pictures.limit } : null,
    creditsRemaining: credits,
    rexJobId: job.jobId,
    resumed: job.replayed,
  });
});
