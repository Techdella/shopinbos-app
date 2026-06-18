import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getOpenAIClient } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = withSeller(async (req: NextRequest) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json({ error: { message: "OpenAI key is not configured." } }, { status: 500 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: { message: "Audio file is required." } }, { status: 400 });
  }

  const transcript = await openai.audio.transcriptions.create({
    model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
    file,
  });

  return NextResponse.json({ text: transcript.text ?? "" });
});
