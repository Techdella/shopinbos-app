// Sound for the 60-second feature intros (src/components/learn/FeatureIntro.tsx): a narrator reads each scene's
// caption and line in the person's language, over soft background music that dips while the voice speaks.
// Pure and import-free: used by the narration API, the player and tests/intro-sound.test.mjs.

/** Bump to make every stored narration clip again (a new voice, new direction). */
export const NARRATION_VERSION = 1;
/** Where generated clips live in the public media bucket. */
export const NARRATION_FOLDER = "platform/intro-voice";
export const NARRATION_LOCALES = ["en", "pcm", "yo", "ha", "ig"] as const;
export type NarrationLocale = (typeof NARRATION_LOCALES)[number];

export function isNarrationLocale(value: unknown): value is NarrationLocale {
  return typeof value === "string" && (NARRATION_LOCALES as readonly string[]).includes(value);
}

/** What the narrator says for a scene: the caption, then the line under it. */
export function narrationText(scene: { caption: string; sub: string }): string {
  const caption = scene.caption.trim();
  const sub = scene.sub.trim();
  if (!sub) return caption;
  return `${/[.!?…:]$/.test(caption) ? caption : `${caption}.`} ${sub}`;
}

/** Small stable hash (FNV-1a, hex), so a changed sentence gets a new clip and an unchanged one is reused. */
export function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Storage path of a scene's clip: platform/intro-voice/<locale>/<intro>-<scene>-v<version>-<hash>.mp3. */
export function narrationPath(introKey: string, scene: number, locale: NarrationLocale, text: string): string {
  return `${NARRATION_FOLDER}/${locale}/${introKey}-${scene}-v${NARRATION_VERSION}-${textHash(text)}.mp3`;
}

/** The language a browser voice should speak (the fallback when the narration service is off). */
export function browserVoiceLang(locale: string): string {
  const base = locale.toLowerCase().split(/[-_]/)[0]!;
  if (base === "yo" || base === "ha" || base === "ig") return `${base}-NG`;
  return "en-NG";
}

/**
 * The best browser voice for a language: an exact match (yo-NG), then the same language anywhere (yo), and for
 * English and Pidgin any English voice (Nigerian, then British, then any). Null when only a wrong-language voice
 * exists: reading Yorùbá with an English voice is worse than the captions alone.
 */
export function pickBrowserVoice<V extends { lang: string; name: string; localService?: boolean }>(voices: readonly V[], lang: string): V | null {
  const want = lang.toLowerCase();
  const base = want.split("-")[0]!;
  const norm = (voice: V) => voice.lang.toLowerCase().replace("_", "-");
  const exact = voices.find((voice) => norm(voice) === want);
  if (exact) return exact;
  if (base === "en") return voices.find((voice) => norm(voice) === "en-gb") ?? voices.find((voice) => norm(voice).startsWith("en")) ?? null;
  return voices.find((voice) => norm(voice).split("-")[0] === base) ?? null;
}

/** Music level (0..1) on its own and under the narrator. */
export const MUSIC_LEVEL = 0.32;
export const MUSIC_UNDER_VOICE = 0.1;
/** How long a scene waits past its time for the narrator to finish before moving on anyway. */
export const VOICE_GRACE_MS = 12_000;

export interface IntroSoundPrefs {
  voice: boolean;
  music: boolean;
}
export const DEFAULT_SOUND_PREFS: IntroSoundPrefs = { voice: true, music: true };

/** Saved sound settings from localStorage (anything unreadable gives the defaults). */
export function parseSoundPrefs(raw: string | null | undefined): IntroSoundPrefs {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<IntroSoundPrefs> | null;
    return { voice: typeof value?.voice === "boolean" ? value.voice : true, music: typeof value?.music === "boolean" ? value.music : true };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}
