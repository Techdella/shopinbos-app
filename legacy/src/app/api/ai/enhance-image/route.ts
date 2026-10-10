import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getOpenAIClient } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { uploadFileServer } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const maxDuration = 120;

const CREDIT_COST = 2;

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

  const body = await req.json().catch(() => ({})) as { imageUrl?: string; prompt?: string };
  const { imageUrl, prompt } = body;

  if (!imageUrl?.trim()) {
    return NextResponse.json({ error: { code: "missing_image", message: "Image URL is required." } }, { status: 400 });
  }

  await db.user.update({ where: { id: user.id }, data: { aiCredits: { decrement: CREDIT_COST } } });

  try {
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) throw new Error("Failed to fetch source image");

    const contentType = imageResp.headers.get("content-type") || "image/jpeg";
    const imageBlob = await imageResp.blob();

    const base64Buffer = Buffer.from(await imageBlob.arrayBuffer()).toString("base64");
    const dataUri = `data:${contentType};base64,${base64Buffer}`;

    const enhancementInstruction = prompt?.trim()
      ? "Enhance this product image. The user requests: " + prompt.trim() + ". Improve the quality, lighting, and composition while keeping the same product."
      : "Enhance this product image. Improve the quality, lighting, clarity, and overall appearance while preserving the original product exactly.";

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: enhancementInstruction,
      n: 1,
      size: "1024x1024",
      style: "vivid",
    });

    const imageData = response.data?.[0];
    const base64Data = imageData?.b64_json;
    const generatedUrl = imageData?.url;

    if (!base64Data && !generatedUrl) throw new Error("No image data returned");

    const resultBlob = base64Data
      ? new Blob([Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))], { type: "image/jpeg" })
      : await fetch(generatedUrl!).then((res) => res.blob());

    const uploaded = await uploadFileServer("brand", resultBlob, `enhanced/${user.id}/${Date.now()}.jpg`);

    const updatedUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });

    return NextResponse.json({
      image: { url: uploaded.publicUrl },
      creditsRemaining: updatedUser?.aiCredits ?? 0,
    });
  } catch (err) {
    await db.user.update({ where: { id: user.id }, data: { aiCredits: { increment: CREDIT_COST } } });
    const message = err instanceof Error ? err.message : "Enhancement failed";
    return NextResponse.json(
      { error: { code: "enhancement_failed", message: `Image enhancement failed — credit refunded. (${message})` } },
      { status: 500 },
    );
  }
});
