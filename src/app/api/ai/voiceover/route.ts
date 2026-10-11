import { NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { getOpenAIClient } from "@/lib/ai/client";
import { VIDEO_LANGUAGES } from "@shared/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LANGUAGE_KEYS = VIDEO_LANGUAGES.map((language) => language.key) as [string, ...string[]];
const VOICE_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

const Schema = z.object({
  text: z.string().trim().min(1).max(320),
  language: z.enum(LANGUAGE_KEYS),
});

const DIRECTION: Record<string, string> = {
  english: "Warm, upbeat Nigerian English accent, like a friendly Lagos shop owner. Natural pace.",
  pidgin: "Nigerian Pidgin, relaxed and playful, Lagos accent. Natural pace.",
  yoruba: "Speak Yorùbá with a native Nigerian accent and correct tones. Warm and clear.",
  hausa: "Speak Hausa with a native northern Nigerian accent. Warm and clear.",
};

// Video studio voiceover: returns an MP3 the browser mixes into the reel.
export const POST = withSeller(async (req) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the script");

  const openai = getOpenAIClient();
  if (!openai) return apiError("SERVICE_UNAVAILABLE", "Voiceovers aren't switched on yet. Your reel can still use captions.", 503);

  try {
    const speech = await openai.audio.speech.create({
      model: VOICE_MODEL,
      voice: "coral",
      input: parsed.data.text,
      instructions: DIRECTION[parsed.data.language],
      response_format: "mp3",
    });
    const audio = Buffer.from(await speech.arrayBuffer());
    return new NextResponse(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[voiceover] failed", error);
    return apiError("SERVICE_UNAVAILABLE", "Couldn't record the voiceover just now. Try again, or make the reel with captions only.", 503);
  }
});
