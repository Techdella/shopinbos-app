import { NextRequest, NextResponse } from "next/server";
import { toFile } from "openai";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { getOpenAIClient } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import {
  VOICE_COPY,
  VOICE_MAX_BYTES,
  audioBytesMatch,
  audioDurationSeconds,
  audioFileName,
  audioProblem,
  cleanTranscript,
  durationProblem,
  normaliseAudioType,
  transcriptionLanguageHint,
  transcriptionPrompt,
  voiceLanguage,
} from "@shared/voice-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/transcribe (multipart): voice typing for every long text field in the seller, supplier and partner
// apps (web and mobile), and Rex's voice notes in onboarding. Any signed-in role.
//   audio       the recording: WebM/Opus, Ogg, M4A/AAC, MP4, WAV or MP3; at most 60 seconds and 10 MB
//   language    optional: the person's app language (en, pcm, yo, ha, ig), used as a hint
//   context     optional: the field being filled ("product description"), to help the model
//   durationMs  optional: what the recorder measured
// → { data: { text }, text } plain text (text is kept at the top level for the older onboarding callers).
// OpenAI only (Claude has no speech-to-text); model from OPENAI_TRANSCRIBE_MODEL, default gpt-4o-mini-transcribe.
// Metered as AI kind "speech" (src/lib/ai/usage.ts). Tests point OPENAI_BASE_URL at a local stub.

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe";

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const openai = getOpenAIClient();
  if (!openai) return apiError("AI_OFF", VOICE_COPY.unavailable, 503);

  // Cheap gate before the body is read, so a loop can't make us buffer megabytes over and over.
  const burst = await checkRateLimitShared(rateLimitKey("voice-typing", user.id), { maxRequests: 20, windowMs: 60_000 });
  if (!burst.allowed) return apiError("RATE_LIMITED", "That's a lot at once. Wait a minute and try again.", 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > VOICE_MAX_BYTES + 64 * 1024) return apiError("AUDIO_TOO_LARGE", "That recording is too big. Keep it under a minute.", 413);

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) return apiError("NO_AUDIO", "We didn't get any sound. Tap the mic and speak again.", 400);

  const type = normaliseAudioType(file.type, file.name);
  const durationMs = Number(form?.get("durationMs") ?? NaN);
  const problem = audioProblem({ type, size: file.size, durationMs: Number.isFinite(durationMs) ? durationMs : null });
  if (problem) return apiError(problem.code, problem.message, problem.status);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!audioBytesMatch(type!, bytes.subarray(0, 16))) return apiError("UNSUPPORTED_AUDIO", "That file isn't a recording we can read. Tap the mic and try again.", 415);
  const tooLong = durationProblem(audioDurationSeconds(type!, bytes));
  if (tooLong) return apiError(tooLong.code, tooLong.message, tooLong.status);

  const limited = await meterAi(user.id, "speech");
  if (limited) return limited;

  const language = voiceLanguage(String(form?.get("language") ?? "") || req.headers.get("x-app-language"));
  const context = String(form?.get("context") ?? "");
  try {
    const transcript = await openai.audio.transcriptions.create({
      model: TRANSCRIBE_MODEL,
      file: await toFile(bytes, audioFileName(type!), { type: type! }),
      prompt: transcriptionPrompt(language, context),
      ...(transcriptionLanguageHint(language) ? { language: transcriptionLanguageHint(language) } : {}),
    });
    const text = cleanTranscript(transcript.text);
    return NextResponse.json({ data: { text }, text });
  } catch (error) {
    console.error("[ai/transcribe] failed", error instanceof Error ? error.message : error);
    const status = (error as { status?: number })?.status;
    // A bad key or a model we can't use is a setup problem: say voice typing is off rather than "try again".
    if (status === 401 || status === 403 || status === 404) return apiError("VOICE_OFF", VOICE_COPY.unavailable, 503);
    return apiError("TRANSCRIBE_FAILED", VOICE_COPY.failed, 502);
  }
});
