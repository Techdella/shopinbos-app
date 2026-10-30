import { NextResponse } from "next/server";
import { z } from "zod";
import { withVideoMaker } from "@/lib/video/owner.server";
import { apiError } from "@/lib/api/response";
import { getOpenAIClient } from "@/lib/ai/client";
import { rexPendingBody, runRexJob } from "@/lib/ai/rex-jobs.server";
import { uploadPublicFileAt } from "@/lib/supabase/storage.server";
import { isOwnImageUrl } from "@/lib/ai/images";
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
  clientKey: z.string().max(80).optional(),
});

const audio = (bytes: Buffer | Uint8Array, voice: string, extra: Record<string, string> = {}) =>
  new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Voice": voice, ...extra } });

class NoVoiceError extends Error {}

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
// both with a Nigerian accent. Sellers and delivery partners (each pays from their own credits). A voice that doesn't
// come through is given back. With `clientKey` it is a Rex job (src/lib/ai/rex-jobs.server.ts): the MP3 is also stored
// (its URL is the job's result) so a seller who left gets it back free; 202 JSON { pending, rexJobId } while speaking.
export const POST = withVideoMaker(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the script");
  const { text, language, gender, provider } = parsed.data;

  if (!getOpenAIClient() && !elevenLabsReady()) return apiError("SERVICE_UNAVAILABLE", "Voiceovers aren't switched on yet. Record your own voice, or make the reel with music and captions.", 503);

  const keep = Boolean(parsed.data.clientKey);
  // Bytes made in this request go straight back; only the stored URL is kept on the job.
  const made: { bytes: Buffer | null } = { bytes: null };
  const job = await runRexJob({ user, kind: "voiceover", clientKey: parsed.data.clientKey, input: { text, language, gender, provider } }, async (rex) => {
    await rex.charge("voice");
    const spoken = await speak(text, language, gender, provider);
    // Kept in storage only for a job, so the seller can come back to it.
    const url = keep
      ? await uploadPublicFileAt(`generated/${user.id}/voice-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.mp3`, new Blob([new Uint8Array(spoken.bytes)], { type: "audio/mpeg" }))
          .then((stored) => stored.publicUrl)
          .catch((error) => {
            console.error("[voiceover] storing the voice failed", error);
            return null;
          })
      : null;
    made.bytes = spoken.bytes;
    return { url, voice: spoken.voice };
  });
  if (job.status === "blocked") return job.response;
  if (job.status === "pending") return NextResponse.json(rexPendingBody(job.jobId), { status: 202 });
  if (job.status === "failed") {
    return apiError("SERVICE_UNAVAILABLE", "The voice didn't come through this time. Try again in a moment, record your own voice, or make the reel with music only.", 503);
  }
  const headers = job.jobId ? { "X-Rex-Job": job.jobId, ...(job.result.url ? { "X-Voice-Url": job.result.url } : {}) } : {};
  if (made.bytes) return audio(made.bytes, job.result.voice, headers);
  // A replay: the stored MP3.
  if (job.result.url && isOwnImageUrl(job.result.url)) {
    const stored = await fetch(job.result.url).catch(() => null);
    if (stored?.ok) return audio(new Uint8Array(await stored.arrayBuffer()), job.result.voice, headers);
  }
  return apiError("SERVICE_UNAVAILABLE", "That voice isn't here any more. Make it again.", 503);
});

/** The voice: ElevenLabs when asked and set up, else Rex's voice (OpenAI), else ElevenLabs as a last try. */
async function speak(text: string, language: string, gender: VoiceGender, provider: "rex" | "elevenlabs") {
  if (provider === "elevenlabs" && elevenLabsReady()) {
    try {
      return { bytes: await elevenLabsSpeech(text, gender), voice: `elevenlabs:${gender}` };
    } catch (error) {
      console.error("[voiceover] elevenlabs failed, trying Rex's voice", error instanceof Error ? error.message : error);
    }
  }
  try {
    const result = await openAiSpeech(text, language, gender);
    if (result) return result;
  } catch (error) {
    console.error("[voiceover] all voices failed", error);
  }
  if (provider !== "elevenlabs" && elevenLabsReady()) {
    try {
      return { bytes: await elevenLabsSpeech(text, gender), voice: `elevenlabs:${gender}` };
    } catch (error) {
      console.error("[voiceover] elevenlabs fallback failed", error instanceof Error ? error.message : error);
    }
  }
  throw new NoVoiceError("no voice");
}
