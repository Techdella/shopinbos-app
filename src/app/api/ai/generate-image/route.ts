import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getOpenAIClient } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CREDIT_COST = 1;

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json({ error: { code: "no_key", message: "OpenAI key not configured" } }, { status: 500 });
  }

  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  if (!dbUser || (dbUser.aiCredits ?? 0) < CREDIT_COST) {
    return NextResponse.json(
      { error: { code: "insufficient_credits", message: "Not enough credits. Top up to continue." } },
      { status: 402 },
    );
  }

  const body = await req.json().catch(() => ({})) as { prompt?: string; size?: "1024x1024" | "1792x1024" | "1024x1792"; style?: "vivid" | "natural" };
  const { prompt, size = "1024x1024", style = "vivid" } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: { code: "missing_prompt", message: "Prompt is required." } }, { status: 400 });
  }

  await db.user.update({ where: { id: user.id }, data: { aiCredits: { decrement: CREDIT_COST } } });

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: prompt.trim(),
      n: 1,
      size,
      style,
    });

    const imageData = response.data?.[0];
    const base64Data = imageData?.b64_json;
    const imageUrl = imageData?.url;

    if (!base64Data && !imageUrl) throw new Error("No image data returned");

    const blob = base64Data
      ? new Blob([Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))], { type: "image/jpeg" })
      : await fetch(imageUrl!).then((res) => res.blob());

    const uploaded = await uploadFileServer("brand", blob, `generated/${user.id}/${Date.now()}.jpg`);

    const updatedUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });

    return NextResponse.json({
      image: { url: uploaded.publicUrl, style, size },
      creditsRemaining: updatedUser?.aiCredits ?? 0,
    });
  } catch (err) {
    await db.user.update({ where: { id: user.id }, data: { aiCredits: { increment: CREDIT_COST } } });
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json(
      { error: { code: "generation_failed", message: `Image generation failed — credit refunded. (${message})` } },
      { status: 500 },
    );
  }
});
