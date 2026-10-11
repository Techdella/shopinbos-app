import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getOpenAIClient } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's transcription limit

// Voice notes to text for Rex (onboarding and builder). OpenAI only: Claude has no speech-to-text.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "Voice notes need an OpenAI key (OPENAI_API_KEY). Type your message instead." } },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Audio file is required." } }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: { code: "TOO_LARGE", message: "That recording is too long. Keep voice notes under a few minutes." } }, { status: 413 });
  }

  const limited = await meterAi(user.id, "voice");
  if (limited) return limited;

  try {
    const transcript = await openai.audio.transcriptions.create({
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
      file,
    });
    return NextResponse.json({ text: transcript.text ?? "" });
  } catch (error) {
    console.error("[ai/transcribe] failed", error);
    return NextResponse.json(
      { error: { code: "TRANSCRIBE_FAILED", message: "Rex couldn't hear that recording. Try again or type it." } },
      { status: 502 },
    );
  }
});
