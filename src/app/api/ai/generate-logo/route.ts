import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getOpenAIClient } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CREDIT_COST = 1;

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
      `A high quality JPEG logo for "${name}", a ${business}. Minimalist and professional with simple geometric forms, one or two colors, refined sans-serif typography, white or transparent background, modern branding style suitable for digital storefronts.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#0E2A38", secondary: "#73D8C8", accent: "#FAF7F1" },
  },
  {
    style: "bold",
    label: "Bold & Vibrant",
    prompt: (name, business, paletteHint) =>
      `A high quality JPEG logo for "${name}", a ${business}. Bold and vibrant with strong typography, African-inspired color energy, memorable mark, and a modern wordmark. Clean composition on a white or transparent background, suitable for branding and e-commerce.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#B33A1C", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
  {
    style: "illustrative",
    label: "Illustrative & Warm",
    prompt: (name, business, paletteHint) =>
      `A high quality JPEG logo for "${name}", a ${business}. Warm and illustrative with an approachable icon or mark, elegant typography, earthy tones, and premium West African-inspired styling. White or transparent background, polished and ready for digital use.${paletteHint ? ` ${paletteHint}` : ""}`,
    palette: { primary: "#7B4F2E", secondary: "#F2A93B", accent: "#FAF7F1" },
  },
];

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json({ error: { code: "no_key", message: "OpenAI key not configured" } }, { status: 500 });
  }

  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  if (!dbUser || dbUser.aiCredits < CREDIT_COST) {
    return NextResponse.json(
      { error: { code: "insufficient_credits", message: "Not enough credits. Top up to continue." } },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => ({})) as { businessName?: string; businessDescription?: string; paletteHint?: string };
  const { businessName, businessDescription, paletteHint } = body;

  if (!businessName?.trim()) {
    return NextResponse.json({ error: { code: "missing_name", message: "Business name is required." } }, { status: 400 });
  }

  // Deduct credit upfront to prevent double-spend
  await db.user.update({ where: { id: user.id }, data: { aiCredits: { decrement: CREDIT_COST } } });

  const results = await Promise.allSettled(
    LOGO_STYLES.map(async ({ style, label, prompt, palette }) => {
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt(businessName, businessDescription || "retail business", paletteHint),
        n: 1,
        size: "1024x1024",
      });

      const imageData = response.data?.[0];
      const base64Data = imageData?.b64_json;
      const imageUrl = imageData?.url;
      if (!base64Data && !imageUrl) throw new Error("No image data returned");

      const blob = base64Data
        ? new Blob([Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))], { type: "image/jpeg" })
        : await fetch(imageUrl!).then((res) => res.blob());
      const uploaded = await uploadFileServer("brand", blob, `logos/${user.id}/${style}-${Date.now()}.jpg`);

      return { style, label, url: uploaded.publicUrl, palette };
    }),
  );

  const logos = results
    .filter((r): r is PromiseFulfilledResult<{ style: string; label: string; url: string; palette: { primary: string; secondary: string; accent: string } }> => r.status === "fulfilled")
    .map((r) => r.value);

  // Refund credit if every logo failed
  if (logos.length === 0) {
    await db.user.update({ where: { id: user.id }, data: { aiCredits: { increment: CREDIT_COST } } });
    const reasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as Error)?.message ?? "unknown")
      .join("; ");
    return NextResponse.json(
      { error: { code: "generation_failed", message: `Logo generation failed — credit refunded. (${reasons})` } },
      { status: 500 },
    );
  }

  const updatedUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  return NextResponse.json({ logos, creditsRemaining: updatedUser?.aiCredits ?? 0 });
});
