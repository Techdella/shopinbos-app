import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { generateImage, isOwnImageUrl, loadReferences } from "@/lib/ai/images";
import { aiAllowanceToday, meterAi } from "@/lib/ai/usage";
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

  const body = (await req.json().catch(() => ({}))) as { businessName?: string; businessDescription?: string; paletteHint?: string; round?: number; likeUrl?: string };
  const { businessName, businessDescription, paletteHint } = body;

  if (!businessName?.trim()) {
    return NextResponse.json({ error: { code: "missing_name", message: "Business name is required." } }, { status: 400 });
  }
  const likeUrl = typeof body.likeUrl === "string" && isOwnImageUrl(body.likeUrl) ? body.likeUrl : null;

  const limited = await meterAi(user.id, "image", LOGO_STYLES.length);
  if (limited) return limited;

  const input = { businessName, business: businessDescription || "retail business", paletteHint, userId: user.id, round: Math.max(1, Math.min(20, Number(body.round) || 1)) };
  const reference = likeUrl ? await loadReferences([likeUrl]) : [];
  const { logos, failures } = reference.length
    ? await drawLogoVariations(input, (prompt, path) => generateImage({ prompt, size: "1024x1024", path, references: reference }))
    : await drawLogoOptions(input, (prompt, path) => generateImage({ prompt, size: "1024x1024", path }));

  if (logos.length === 0) {
    return NextResponse.json({ error: { code: "generation_failed", message: `Logo generation failed. (${failures.join("; ")})` } }, { status: 500 });
  }

  const plan = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  const [credits, allowance] = await Promise.all([creditBalance(user.id), aiAllowanceToday(user.id, plan?.aiCredits)]);
  const pictures = allowance?.find((row) => row.kind === "image") ?? null;
  return NextResponse.json({ logos, creditsRemaining: credits, pictures: pictures ? { used: pictures.used, limit: pictures.limit } : null });
});
