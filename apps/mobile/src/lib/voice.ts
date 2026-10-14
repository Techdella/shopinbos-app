import { Platform } from "react-native";
import { api, ApiError } from "./api";
import { VOICE_COPY, voiceErrorMessage, voiceLanguage } from "@shared/voice-input";

// Voice typing: sends a recording to POST /api/ai/transcribe and returns the words (plain text).

/** The phone's language as an app language code (en, pcm, yo, ha, ig), or null to let the model detect it. */
export function deviceVoiceLanguage() {
  try {
    return voiceLanguage(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

export async function transcribeRecording(input: { uri: string; durationMs: number; language?: string | null; context?: string }): Promise<string> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // On the web build the recorder hands back a blob: URL.
    const blob = await (await fetch(input.uri)).blob();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", blob, `voice.${ext}`);
  } else {
    // React Native's FormData takes { uri, name, type } file parts. Both platforms record AAC in .m4a.
    form.append("audio", { uri: input.uri, name: "voice.m4a", type: "audio/mp4" } as unknown as Blob);
  }
  form.append("durationMs", String(Math.round(input.durationMs)));
  const language = input.language ?? deviceVoiceLanguage();
  if (language) form.append("language", language);
  if (input.context) form.append("context", input.context);
  try {
    const data = await api<{ text?: string }>("/api/ai/transcribe", { method: "POST", body: form });
    return (data?.text ?? "").trim();
  } catch (error) {
    if (error instanceof ApiError) throw new Error(voiceErrorMessage(error.code, error.status, error.message));
    throw new Error(VOICE_COPY.failed);
  }
}
