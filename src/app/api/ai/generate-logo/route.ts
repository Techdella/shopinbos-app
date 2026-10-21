import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { generateImage, isOwnImageUrl, loadReferences } from "@/lib/ai/images";
import { aiAllowanceToday, meterAiCharged, refundAi } from "@/lib/ai/usage";
import { drawLogoOptions, drawLogoVariations, LOGO_STYLES } from "@/lib/ai/rex/logo";

export const runtime = "nodejs";
export const maxDuration = 120;

// Logo studio: three logo ideas for the business. `round` > 1 asks for a fresh direction ("New ideas");
// `likeUrl` (one of the seller's logos) makes three variations of it ("More like this"). Each logo is one
// picture from the daily allowance (then credits); the reply says how much of today's allowance is used.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (!getOpenAIClient()) {
    return NextResponse.json({ error: { code: "no_key", message: aiConfigured() ? "Logos need an OpenAI key (OPENAI_API_KEY)." : "AI isn't switched on yet." } }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { businessName?: string; businessDescription?: string; paletteHint?: string; round?: number; likeUrl?: string; notes?: string; referenceUrls?: unknown };
  const { businessName, businessDescription, paletteHint } = body;

  if (!businessName?.trim()) {
    return NextResponse.json({ error: { code: "missing_name", message: "Business name is required." } }, { status: 400 });
  }
  const likeUrl = typeof body.likeUrl === "string" && isOwnImageUrl(body.likeUrl) ? body.likeUrl : null;

  const metered = await meterAiCharged(user.id, "image", LOGO_STYLES.length);
  if (metered.blocked) return metered.blocked;

  // Context the seller added: notes, and up to 3 inspiration pictures (photos or video stills) in our storage.
  const inspirationUrls = Array.isArray(body.referenceUrls) ? body.referenceUrls.filter((url): url is string => typeof url === "string" && isOwnImageUrl(url) && url !== likeUrl).slice(0, 3) : [];
  const [likeRef, inspiration] = await Promise.all([likeUrl ? loadReferences([likeUrl]) : Promise.resolve([]), loadReferences(inspirationUrls)]);
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 600) : "";
  const input = { businessName, business: businessDescription || "retail business", paletteHint, userId: user.id, round: Math.max(1, Math.min(20, Number(body.round) || 1)), notes, inspiration: inspiration.length };
  const references = [...likeRef, ...inspiration];
  const draw = (prompt: string, path: string) => generateImage({ prompt, size: "1024x1024", path, references });
  const { logos, failures } = likeRef.length ? await drawLogoVariations(input, draw) : await drawLogoOptions(input, draw);

  // Logos that failed to draw are given back (credits and the day's cap).
  const failed = Math.max(0, LOGO_STYLES.length - logos.length);
  if (failed) await refundAi(user.id, "image", failed, Math.round((metered.credits / LOGO_STYLES.length) * failed));

  if (logos.length === 0) {
    return NextResponse.json({ error: { code: "generation_failed", message: `Logo generation failed. (${failures.join("; ")})` } }, { status: 500 });
  }

  const plan = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  const [credits, allowance] = await Promise.all([creditBalance(user.id), aiAllowanceToday(user.id, plan?.aiCredits)]);
  const pictures = allowance?.find((row) => row.kind === "image") ?? null;
  return NextResponse.json({ logos, creditsRemaining: credits, pictures: pictures ? { used: pictures.used, limit: pictures.limit } : null });
});
