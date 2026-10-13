// Voice typing (build spec 8A: "voice input on every text field that takes more than a few words").
// Pure helpers shared by POST /api/ai/transcribe, the web VoiceInputButton and the mobile VoiceInput, unit-tested
// in tests/voice-and-videos.test.mjs. No imports, so web, server, mobile and Node tests can all load it.

/** Longest recording we accept. The buttons stop on their own at this point. */
export const VOICE_MAX_SECONDS = 60;
/** Largest upload we accept. A minute of speech is well under 2 MB in every format the apps record. */
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
/** A little slack for container rounding (and the recorder stopping a beat late). */
const DURATION_SLACK_SECONDS = 2;

/** Audio types we take, by their base type, with the file extension OpenAI wants to see. */
const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm", // Chrome's MediaRecorder sometimes labels audio-only recordings video/webm
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/x-aac": "m4a",
  "video/mp4": "mp4", // iOS Safari records audio/mp4, some Android browsers video/mp4
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
};

const EXTENSION_TYPES: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", opus: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", mp4: "audio/mp4", aac: "audio/mp4", "3gp": "audio/mp4", wav: "audio/wav", mp3: "audio/mpeg" };

export const VOICE_ACCEPTED_LABEL = "WebM, Ogg, M4A, AAC, MP4, WAV or MP3";

/**
 * The base audio type for an upload, or null when we don't take it. Phones sometimes send no type (or
 * application/octet-stream), so the file name's extension is used then.
 */
export function normaliseAudioType(declared: string | null | undefined, fileName?: string | null): string | null {
  const base = (declared ?? "").toLowerCase().split(";")[0]!.trim();
  if (base && AUDIO_TYPES[base]) return base;
  if (!base || base === "application/octet-stream") {
    const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
    return EXTENSION_TYPES[ext] ?? null;
  }
  return null;
}

/** File name to hand OpenAI (it reads the extension). */
export function audioFileName(type: string) {
  return `voice.${AUDIO_TYPES[type] ?? "webm"}`;
}

export interface VoiceProblem {
  code: "NO_AUDIO" | "UNSUPPORTED_AUDIO" | "AUDIO_TOO_LARGE" | "AUDIO_TOO_LONG";
  status: 400 | 413 | 415;
  message: string;
}

/** Why this recording can't be transcribed, or null. `durationMs` is what the recorder reported, if anything. */
export function audioProblem(input: { type: string | null; size: number; durationMs?: number | null }): VoiceProblem | null {
  if (!input.size) return { code: "NO_AUDIO", status: 400, message: "We didn't get any sound. Tap the mic and speak again." };
  if (!input.type) return { code: "UNSUPPORTED_AUDIO", status: 415, message: `That recording type can't be used. Send ${VOICE_ACCEPTED_LABEL}.` };
  if (input.size > VOICE_MAX_BYTES) return { code: "AUDIO_TOO_LARGE", status: 413, message: "That recording is too big. Keep it under a minute." };
  if (input.durationMs != null && Number.isFinite(input.durationMs) && input.durationMs > (VOICE_MAX_SECONDS + DURATION_SLACK_SECONDS) * 1000) {
    return { code: "AUDIO_TOO_LONG", status: 413, message: "That's over a minute. Say it in shorter parts." };
  }
  return null;
}

/** Same check on the length read from the file itself (see audioDurationSeconds). */
export function durationProblem(seconds: number | null): VoiceProblem | null {
  return seconds != null && seconds > VOICE_MAX_SECONDS + DURATION_SLACK_SECONDS ? { code: "AUDIO_TOO_LONG", status: 413, message: "That's over a minute. Say it in shorter parts." } : null;
}

// ─── What the bytes really are ───────────────────────────────────────────────

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.slice(start, end));

/** True when the first bytes look like the declared audio type (so nothing else is passed off as audio). */
export function audioBytesMatch(type: string, head: Uint8Array): boolean {
  switch (AUDIO_TYPES[type]) {
    case "webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    case "ogg":
      return ascii(head, 0, 4) === "OggS";
    case "m4a":
    case "mp4":
      // ISO media ("ftyp" box), or raw AAC in ADTS frames (0xFFF sync word).
      return ascii(head, 4, 8) === "ftyp" || (head[0] === 0xff && (head[1]! & 0xf6) === 0xf0);
    case "wav":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WAVE";
    case "mp3":
      return ascii(head, 0, 3) === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
    default:
      return false;
  }
}

function indexOfAscii(b: Uint8Array, needle: string, from = 0, to = b.length) {
  const codes = [...needle].map((c) => c.charCodeAt(0));
  const end = Math.min(to, b.length) - codes.length;
  outer: for (let i = from; i <= end; i++) {
    for (let j = 0; j < codes.length; j++) if (b[i + j] !== codes[j]) continue outer;
    return i;
  }
  return -1;
}

const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
const u32le = (b: Uint8Array, i: number) => b[i]! + (b[i + 1]! << 8) + (b[i + 2]! << 16) + ((b[i + 3]! << 24) >>> 0);

/**
 * The recording's length in seconds read from the file, or null when the container doesn't say (browser WebM
 * recordings have no duration until they're finalised). WAV, MP4/M4A (mvhd) and Ogg (last granule) are read.
 */
export function audioDurationSeconds(type: string, bytes: Uint8Array): number | null {
  try {
    const kind = AUDIO_TYPES[type];
    if (kind === "wav") {
      const byteRate = u32le(bytes, 28);
      const data = indexOfAscii(bytes, "data", 12, 4096);
      if (!byteRate || data < 0) return null;
      return u32le(bytes, data + 4) / byteRate;
    }
    if (kind === "m4a" || kind === "mp4") {
      const at = indexOfAscii(bytes, "mvhd");
      if (at < 0) return null;
      const version = bytes[at + 4];
      const base = at + 8; // after the version and flags
      if (version === 1) {
        const timescale = u32(bytes, base + 16);
        const duration = u32(bytes, base + 20) * 2 ** 32 + u32(bytes, base + 24);
        return timescale ? duration / timescale : null;
      }
      const timescale = u32(bytes, base + 8);
      return timescale ? u32(bytes, base + 12) / timescale : null;
    }
    if (kind === "ogg") {
      // Opus counts in 48 kHz samples; Vorbis in its own rate, from the identification header.
      let rate = 48_000;
      const vorbis = indexOfAscii(bytes, "vorbis", 0, 512);
      if (vorbis > 0 && bytes[vorbis - 1] === 1) rate = u32le(bytes, vorbis + 11) || rate;
      let last = -1;
      for (let i = Math.max(0, bytes.length - 65_536); i >= 0; ) {
        const found = indexOfAscii(bytes, "OggS", i);
        if (found < 0) break;
        last = found;
        i = found + 4;
      }
      if (last < 0) return null;
      const granule = u32le(bytes, last + 6) + u32le(bytes, last + 10) * 2 ** 32;
      return granule > 0 && granule < 2 ** 52 ? granule / rate : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Language and context for the speech model ───────────────────────────────

export const VOICE_LANGUAGES = ["en", "pcm", "yo", "ha", "ig"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

/** The app's language code from what a client sends ("yo", "yoruba", "en-NG", "pidgin"…), or null. */
export function voiceLanguage(value: string | null | undefined): VoiceLanguage | null {
  const raw = (value ?? "").toLowerCase().trim();
  if (!raw) return null;
  const aliases: Record<string, VoiceLanguage> = { english: "en", pidgin: "pcm", "naija": "pcm", yoruba: "yo", "yorùbá": "yo", hausa: "ha", igbo: "ig" };
  if (aliases[raw]) return aliases[raw]!;
  const base = raw.split(/[-_]/)[0]!;
  return (VOICE_LANGUAGES as readonly string[]).includes(base) ? (base as VoiceLanguage) : null;
}

/**
 * The ISO-639-1 hint for OpenAI, or undefined to let it detect. Pidgin has no ISO-639-1 code and Igbo isn't
 * one the speech models list, so those rely on the prompt instead (a wrong hint is worse than none).
 */
export function transcriptionLanguageHint(language: VoiceLanguage | null): string | undefined {
  return language === "en" || language === "yo" || language === "ha" ? language : undefined;
}

const LANGUAGE_NAME: Record<VoiceLanguage, string> = { en: "Nigerian English", pcm: "Nigerian Pidgin", yo: "Yorùbá", ha: "Hausa", ig: "Igbo" };

/** Nigerian context for the speech model, so names, Pidgin and naira amounts come out right. */
export function transcriptionPrompt(language: VoiceLanguage | null, context?: string | null) {
  const field = (context ?? "").replace(/[^\p{L}\p{N} ,.'-]/gu, "").trim().slice(0, 80);
  return [
    "A Nigerian small business owner is speaking about their shop: products, orders, customers, delivery and payments.",
    "They may speak Nigerian English, Pidgin, Yorùbá, Hausa or Igbo, or mix them.",
    language ? `They chose ${LANGUAGE_NAME[language]}.` : "",
    "Write naira amounts like ₦18,500 and keep Nigerian names and places as spoken.",
    field ? `They are filling in: ${field}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Tidies what the model returned: one line of plain text per paragraph, no stray spaces, a sane length. */
export function cleanTranscript(text: string | null | undefined, max = 5000) {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Puts what was said into the field: after what's there (with a space), or instead of it. */
export function mergeVoiceText(current: string, spoken: string, mode: "append" | "replace" = "append", maxLength?: number) {
  const said = spoken.trim();
  if (!said) return current;
  const next = mode === "replace" || !current.trim() ? said : `${current.replace(/\s+$/, "")}${/[\n]$/.test(current) ? "" : " "}${said}`;
  return maxLength ? next.slice(0, maxLength) : next;
}

// ─── Words on the buttons (same on web and mobile) ───────────────────────────

export const VOICE_COPY = {
  idle: "Tap and speak",
  listening: "Listening… tap to stop",
  working: "Writing it down…",
  unavailable: "Voice typing isn't available right now. Type it instead.",
  deniedWeb: "Allow the microphone in your browser to use voice typing.",
  deniedPhone: "Allow the microphone for Shopinbos in your phone's Settings to use voice typing.",
  noMic: "This browser can't record. Type it instead.",
  nothingHeard: "We didn't catch anything. Tap the mic and speak a little closer.",
  tooLong: "That's over a minute. Say it in shorter parts.",
  failed: "We couldn't write that down. Try again, or type it.",
  permissionWhy: "Shopinbos uses the microphone only while you tap the mic, so you can speak instead of typing.",
} as const;

/** The words for a failed transcription, from the API's error code and HTTP status. */
export function voiceErrorMessage(code: string | null | undefined, status: number, message?: string | null) {
  if (code === "AI_OFF" || code === "VOICE_OFF" || status === 503) return VOICE_COPY.unavailable;
  if (code === "AUDIO_TOO_LONG") return VOICE_COPY.tooLong;
  if (code === "NO_SPEECH") return VOICE_COPY.nothingHeard;
  if (status === 429 && message) return message;
  if (code && /^(AUDIO_|UNSUPPORTED_AUDIO|NO_AUDIO)/.test(code) && message) return message;
  return VOICE_COPY.failed;
}

/** "0:07" for the listening timer. */
export function voiceTimer(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
