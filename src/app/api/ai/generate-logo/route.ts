import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured, getOpenAIClient } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { generateImage } from "@/lib/ai/images";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

type LogoPromptFn = (name: string, business: string, paletteHint?: string) => string;

const LOGO_STYLES: {
  style: string;
  label: string;
  prompt: LogoPromptFn;
  palette: { primary: string; secondary: string; accent: string };
}[] = [
  {
    style: "minimalist",
    label: "Clean & Minimal",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Minimalist and professional with simple geometric forms, one or two colors, refined sans-serif typography, white or transparent background, modern branding style suitable for digital storefronts.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#0E2A38", secondary: "#73D8C8", accent: "#FAF7F1" },
  },
  {
    style: "bold",
    label: "Bold & Vibrant",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Bold and vibrant with strong typography, African-inspired color energy, memorable mark, and a modern wordmark. Clean composition on a white or transparent background, suitable for branding and e-commerce.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#B33A1C", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
  {
    style: "illustrative",
    label: "Illustrative & Warm",
    prompt: (name, business, paletteHint) =>
      `A high quality logo for "${name}", a ${business}. Warm and illustrative with an approachable icon or mark, elegant typography, earthy tones, and premium West African-inspired styling. White or transparent background, polished and ready for digital use.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#7B4F2E", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
];

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

  const results = await Promise.allSettled(
    LOGO_STYLES.map(async ({ style, label, prompt, palette }) => {
      const url = await generateImage({
        prompt: prompt(businessName.trim().slice(0, 80), (businessDescription || "retail business").slice(0, 300), paletteHint?.slice(0, 200)),
        size: "1024x1024",
        path: `logos/${user.id}/${style}-${Date.now()}`,
      });
      return { style, label, url, palette };
    }),
  );

  const logos = results
    .filter((r): r is PromiseFulfilledResult<{ style: string; label: string; url: string; palette: { primary: string; secondary: string; accent: string } }> => r.status === "fulfilled")
    .map((r) => r.value);

  if (logos.length === 0) {
    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as Error)?.message ?? "unknown")
      .join("; ");
    return NextResponse.json({ error: { code: "generation_failed", message: `Logo generation failed. (${reasons})` } }, { status: 500 });
  }

  const credits = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  return NextResponse.json({ logos, creditsRemaining: credits?.aiCredits ?? 0 });
});
