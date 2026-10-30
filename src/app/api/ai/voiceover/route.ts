import { NextResponse } from "next/server";
import { z } from "zod";
import { withVideoMaker } from "@/lib/video/owner.server";
import { apiError } from "@/lib/api/response";
import { getOpenAIClient } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { elevenLabsReady, elevenLabsSpeech } from "@/lib/ai/elevenlabs.server";
import { VIDEO_LANGUAGES } from "@shared/video";
import { VOICE_GENDERS, openAiVoice, voiceDirection, type VoiceGender } from "@shared/video-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LANGUAGE_KEYS = VIDEO_LANGUAGES.map((language) => language.key) as [string, ...string[]];
const EXPRESSIVE_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

const Schema = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.enum(LANGUAGE_KEYS),
  gender: z.enum(VOICE_GENDERS).optional().default("female"),
  provider: z.enum(["rex", "elevenlabs"]).optional().default("rex"),
});

const audio = (bytes: Buffer, voice: string) =>
  new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice": voice } });

/** OpenAI speech: the expressive model with a Nigerian accent, then the basic voices if that fails. */
async function openAiSpeech(text: string, language: string, gender: VoiceGender) {
  const openai = getOpenAIClient();
  if (!openai) return null;
  const attempts = [
    { model: EXPRESSIVE_MODEL, voice: openAiVoice(gender, "expressive"), instructions: voiceDirection(language, gender) },
    { model: "tts-1-hd", voice: openAiVoice(gender, "basic") },
    { model: "tts-1", voice: openAiVoice(gender, "basic") },
  ];
  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const speech = await openai.audio.speech.create({ ...attempt, input: text, response_format: "mp3" }, { timeout: 40_000, maxRetries: 1 });
      const bytes = Buffer.from(await speech.arrayBuffer());
      if (bytes.length > 1000) return { bytes, voice: `${attempt.model}:${attempt.voice}` };
      lastError = new Error("empty audio");
    } catch (error) {
      lastError = error;
      console.error(`[voiceover] ${attempt.model} failed`, error instanceof Error ? error.message : error);
    }
  }
  throw lastError ?? new Error("no voice");
}

// Video studio voiceover: returns an MP3 the browser mixes into the reel. provider "elevenlabs" uses the
// account's ElevenLabs voices when set up (falling back to Rex's voice); gender picks a female or male voice,
// both with a Nigerian accent. Sellers and delivery partners (each pays from their own credits).
export const POST = withVideoMaker(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the script");
  const { text, language, gender, provider } = parsed.data;

  if (!getOpenAIClient() && !elevenLabsReady()) return apiError("SERVICE_UNAVAILABLE", "Voiceovers aren't switched on yet. Record your own voice, or make the reel with music and captions.", 503);

  const limited = await meterAi(user.id, "voice");
  if (limited) return limited;

  if (provider === "elevenlabs" && elevenLabsReady()) {
    try {
      const bytes = await elevenLabsSpeech(text, gender);
      return audio(bytes, `elevenlabs:${gender}`);
    } catch (error) {
      console.error("[voiceover] elevenlabs failed, trying Rex's voice", error instanceof Error ? error.message : error);
    }
  }

  try {
    const result = await openAiSpeech(text, language, gender);
    if (result) return audio(result.bytes, result.voice);
  } catch (error) {
    console.error("[voiceover] all voices failed", error);
  }
  if (provider !== "elevenlabs" && elevenLabsReady()) {
    try {
      return audio(await elevenLabsSpeech(text, gender), `elevenlabs:${gender}`);
    } catch (error) {
      console.error("[voiceover] elevenlabs fallback failed", error instanceof Error ? error.message : error);
    }
  }
  return apiError("SERVICE_UNAVAILABLE", "The voice didn't come through this time. Try again in a moment, record your own voice, or make the reel with music only.", 503);
});
