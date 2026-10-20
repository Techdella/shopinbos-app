import "server-only";

import type { VoiceAccent, VoiceGender } from "@shared/video-style";

// ElevenLabs voices for reel voiceovers (video studio, "Studio voice"; sellers never see the provider's name).
// Set ELEVENLABS_API_KEY and, for a Nigerian accent, the ids of Nigerian voices from the ElevenLabs voice library
// in ELEVENLABS_VOICE_FEMALE and ELEVENLABS_VOICE_MALE. Other accents use ELEVENLABS_VOICE_<ACCENT>_<GENDER>
// (e.g. ELEVENLABS_VOICE_GHANAIAN_FEMALE); an accent without its own voice is spoken by Rex's voice instead.
// ELEVENLABS_MODEL defaults to the multilingual model.

const API = "https://api.elevenlabs.io/v1/text-to-speech";
// ElevenLabs' stock voices, used only until Nigerian voices are configured.
const STOCK = { female: "EXAVITQu4vr4xnSDxMaL", male: "TxGEqnHWrfWFTfGW9XjX" } as const;

export function elevenLabsReady() {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** The voice for an accent, or null when that accent has no ElevenLabs voice set up. */
export function elevenLabsVoiceId(gender: VoiceGender, accent: VoiceAccent = "nigerian") {
  const own = process.env[`ELEVENLABS_VOICE_${accent.toUpperCase()}_${gender.toUpperCase()}`]?.trim();
  if (own) return own;
  if (accent !== "nigerian") return null;
  return (gender === "male" ? process.env.ELEVENLABS_VOICE_MALE : process.env.ELEVENLABS_VOICE_FEMALE)?.trim() || STOCK[gender];
}

export async function elevenLabsSpeech(text: string, gender: VoiceGender, accent: VoiceAccent = "nigerian"): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ElevenLabs isn't set up");
  const voiceId = elevenLabsVoiceId(gender, accent);
  if (!voiceId) throw new Error(`No ElevenLabs voice for the ${accent} accent`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const response = await fetch(`${API}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error("ElevenLabs returned no audio");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
