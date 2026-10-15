import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { generateImage } from "@/lib/ai/images";
import { meterAi } from "@/lib/ai/usage";
import { drawLogoOptions, LOGO_STYLES } from "@/lib/ai/rex/logo";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (!getOpenAIClient()) {
    return NextResponse.json({ error: { code: "no_key", message: aiConfigured() ? "Logos need an OpenAI key (OPENAI_API_KEY)." : "AI isn't switched on yet." } }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as { businessName?: string; businessDescription?: string; paletteHint?: string };
  const { businessName, businessDescription, paletteHint } = body;

  if (!businessName?.trim()) {
    return NextResponse.json({ error: { code: "missing_name", message: "Business name is required." } }, { status: 400 });
  }

  const limited = await meterAi(user.id, "image", LOGO_STYLES.length);
  if (limited) return limited;

  const { logos, failures } = await drawLogoOptions(
    { businessName, business: businessDescription || "retail business", paletteHint, userId: user.id },
    (prompt, path) => generateImage({ prompt, size: "1024x1024", path }),
  );

  if (logos.length === 0) {
    return NextResponse.json({ error: { code: "generation_failed", message: `Logo generation failed. (${failures.join("; ")})` } }, { status: 500 });
  }

  const credits = await creditBalance(user.id);
  return NextResponse.json({ logos, creditsRemaining: credits });
});
