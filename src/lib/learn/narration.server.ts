import "server-only";

import { getOpenAIClient } from "@/lib/ai/client";
import { elevenLabsReady, elevenLabsSpeech } from "@/lib/ai/elevenlabs.server";
import { storageBase } from "@/lib/help-videos.server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { introByKey } from "@shared/feature-intros";
import intros from "@shared/i18n/messages/intros/index.ts";
import { narrationPath, narrationText, type NarrationLocale } from "@shared/intro-narration";

// Narration for the 60-second feature intros: one MP3 per intro, scene and language, made once with the same
// Nigerian-accent voices as the video studio (OpenAI, else ElevenLabs) and kept in the public media bucket under
// platform/intro-voice/. Only intro text is ever spoken (looked up here by key), so nobody can make it say
// anything else, and the set of clips is bounded: no credits are taken.

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";
const MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

const ACCENT: Record<NarrationLocale, string> = {
  en: "Speak English with a warm, natural Nigerian accent.",
  pcm: "Speak Nigerian Pidgin with a relaxed Lagos accent.",
  yo: "Speak Yorùbá with a native Nigerian accent and the correct tones.",
  ha: "Speak Hausa with a native northern Nigerian accent.",
  ig: "Speak Igbo with a native south-eastern Nigerian accent and the correct tones.",
};

export function narrationReady() {
  return Boolean(getOpenAIClient()) || elevenLabsReady();
}

/** The words for a scene (1-based) in a language, English where there's no translation; null for unknown scenes. */
export function sceneNarration(introKey: string, scene: number, locale: NarrationLocale): string | null {
  const intro = introByKey(introKey);
  const source = intro?.scenes[scene - 1];
  if (!intro || !source) return null;
  const words = (intros as Record<string, Record<string, string>>)[locale] ?? {};
  return narrationText({ caption: words[`${intro.key}.${scene}.caption`] ?? source.caption, sub: words[`${intro.key}.${scene}.sub`] ?? source.sub });
}

async function speak(text: string, locale: NarrationLocale): Promise<Buffer> {
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const speech = await openai.audio.speech.create(
        {
          model: MODEL,
          voice: "coral",
          input: text,
          response_format: "mp3",
          instructions: `A warm, friendly Nigerian woman explaining a feature of a selling app to a small business owner, like a patient friend showing them how. ${ACCENT[locale]} Calm, clear and encouraging, an easy pace, a smile in the voice, no American or British accent.`,
        },
        { timeout: 40_000, maxRetries: 1 },
      );
      const bytes = Buffer.from(await speech.arrayBuffer());
      if (bytes.length > 1000) return bytes;
    } catch (error) {
      console.error("[intro narration] openai failed", error instanceof Error ? error.message : error);
      if (!elevenLabsReady()) throw error;
    }
  }
  return elevenLabsSpeech(text, "female");
}

const known = new Set<string>();
const making = new Map<string, Promise<string>>();

async function stored(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Public URL of the scene's clip, making and storing it the first time. Throws when no voice service works. */
export async function narrationUrl(introKey: string, scene: number, locale: NarrationLocale, text: string): Promise<string> {
  const path = narrationPath(introKey, scene, locale, text);
  const url = `${storageBase()}${path}`;
  if (known.has(path)) return url;
  const pending = making.get(path);
  if (pending) return pending;
  const job = (async () => {
    if (await stored(url)) {
      known.add(path);
      return url;
    }
    const bytes = await speak(text, locale);
    const supabase = await getSupabaseServiceClient();
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "audio/mpeg", cacheControl: "31536000", upsert: true });
    if (error) throw new Error(error.message);
    known.add(path);
    return url;
  })();
  making.set(path, job);
  try {
    return await job;
  } finally {
    making.delete(path);
  }
}
