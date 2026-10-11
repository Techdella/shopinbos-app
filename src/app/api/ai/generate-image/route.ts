import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { generateImage, ImageUnavailableError, normaliseImageSize } from "@/lib/ai/images";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

// Rex Studio "Generate image": a prompt in, a stored image URL out.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; size?: string; transparent?: boolean };
  const prompt = body.prompt?.trim();
  if (!prompt) return NextResponse.json({ error: { code: "missing_prompt", message: "Describe the image you want." } }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: { code: "too_long", message: "Keep the description under 2,000 characters." } }, { status: 400 });

  const limited = await meterAi(user.id, "image");
  if (limited) return limited;

  const size = normaliseImageSize(body.size);
  try {
    const url = await generateImage({ prompt, size, transparent: Boolean(body.transparent), path: `generated/${user.id}/${Date.now()}` });
    const credits = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
    return NextResponse.json({ image: { url, size }, creditsRemaining: credits?.aiCredits ?? 0 });
  } catch (error) {
    const status = error instanceof ImageUnavailableError ? 503 : 500;
    const message = error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: { code: "generation_failed", message } }, { status });
  }
});
