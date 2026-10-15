import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { ImageUnavailableError, isOwnImageUrl, MAX_REFERENCES, normaliseImageSize } from "@/lib/ai/images";
import { loadSellerBrandContext } from "@/lib/ai/brand-context.server";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { aiAllowanceToday, meterAi } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const maxDuration = 180;

const LOOKS: Record<string, string> = {
  vivid: "Look: vivid and punchy, rich colour and crisp contrast.",
  natural: "Look: natural and true to life, soft realistic light.",
};

// Rex Studio "Make image": a prompt in, a stored image URL out. With useLogo the seller's logo goes in as a
// reference so it is reproduced, not invented; useBrand keeps to their colours; referenceUrls are photos (or
// video stills) they uploaded for Rex to work from.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; size?: string; style?: string; useLogo?: boolean; useBrand?: boolean; referenceUrls?: unknown };
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: { code: "missing_prompt", message: "Describe the image you want." } }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: { code: "too_long", message: "Keep the description under 2,000 characters." } }, { status: 400 });
  const references = Array.isArray(body.referenceUrls) ? body.referenceUrls.filter((url): url is string => typeof url === "string" && isOwnImageUrl(url)).slice(0, MAX_REFERENCES) : [];

  const limited = await meterAi(user.id, "image");
  if (limited) return limited;

  const size = normaliseImageSize(body.size);
  try {
    const brand = await loadSellerBrandContext(user.id);
    const look = body.style ? LOOKS[body.style] : undefined;
    const result = await makeBrandImage({
      brand,
      prompt: look ? `${prompt}\n${look}` : prompt,
      size,
      logo: Boolean(body.useLogo),
      colours: body.useBrand !== false,
      referenceUrls: references,
      path: `generated/${user.id}/${Date.now()}`,
    });
    const plan = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
    const [credits, allowance] = await Promise.all([creditBalance(user.id), aiAllowanceToday(user.id, plan?.aiCredits)]);
    const pictures = allowance?.find((row) => row.kind === "image") ?? null;
    return NextResponse.json({
      pictures: pictures ? { used: pictures.used, limit: pictures.limit } : null,
      image: { url: result.url, size, style: body.style ?? null },
      usedLogo: result.usedLogo,
      usedReferences: result.usedReferences,
      logoProblem: result.logoProblem,
      creditsRemaining: credits,
    });
  } catch (error) {
    const status = error instanceof ImageUnavailableError ? 503 : 500;
    const message = error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: { code: "generation_failed", message } }, { status });
  }
});
