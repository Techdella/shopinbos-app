// Video studio: three or more photos in, a 9:16 reel out, with captions and an optional voiceover.
// Pure helpers shared by the web page and the script API, unit-tested.

export const VIDEO_LANGUAGES = [
  { key: "english", label: "English" },
  { key: "pidgin", label: "Pidgin" },
  { key: "yoruba", label: "Yorùbá" },
  { key: "hausa", label: "Hausa" },
] as const;
export type VideoLanguage = (typeof VIDEO_LANGUAGES)[number]["key"];

export const VIDEO_SIZE = { width: 720, height: 1280 } as const;
export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 6;

export interface VideoScript {
  /** One short on-screen line per photo. */
  captions: string[];
  /** What the voice says; about 2 to 3 sentences. */
  voiceover: string;
  /** End card call to action, e.g. "Tap the link to order". */
  cta: string;
}

const FALLBACK: Record<VideoLanguage, { lines: (name: string, price: string) => string[]; voice: (name: string, price: string) => string; cta: string }> = {
  english: {
    lines: (name, price) => [name, "Made to stand out", price ? `Only ${price}` : "Limited stock", "Delivered to your door"],
    voice: (name, price) => `Meet the ${name}. ${price ? `Just ${price}, ` : ""}delivered to your door. Tap the link and order before it sells out.`,
    cta: "Tap the link to order",
  },
  pidgin: {
    lines: (name, price) => [name, "E dey make you fine", price ? `Na ${price} only` : "E no plenty", "We go deliver reach you"],
    voice: (name, price) => `See this ${name}. ${price ? `Na ${price} only, ` : ""}we go deliver am reach your door. Tap the link before e finish.`,
    cta: "Tap the link make you order",
  },
  yoruba: {
    lines: (name, price) => [name, "Ó dára gan-an", price ? `${price} péré` : "Kò pọ̀", "A ó mú un dé ẹnu ọ̀nà rẹ"],
    voice: (name, price) => `Ẹ wo ${name} yìí. ${price ? `${price} péré. ` : ""}A ó mú un dé ọ̀dọ̀ yín. Ẹ tẹ link náà kí ó tó tán.`,
    cta: "Tẹ link náà láti ra",
  },
  hausa: {
    lines: (name, price) => [name, "Yana da kyau sosai", price ? `${price} kacal` : "Kaɗan ne suka rage", "Za mu kawo maka har gida"],
    voice: (name, price) => `Ga ${name}. ${price ? `${price} kacal. ` : ""}Za mu kawo maka har ƙofar gida. Danna link ɗin kafin ya ƙare.`,
    cta: "Danna link ɗin don saya",
  },
};

/** A usable script without AI, so the studio always works. */
export function fallbackScript(name: string, price: string, language: VideoLanguage, photos: number): VideoScript {
  const copy = FALLBACK[language];
  const lines = copy.lines(name, price);
  return { captions: Array.from({ length: Math.max(1, photos) }, (_, i) => lines[i % lines.length]), voiceover: copy.voice(name, price), cta: copy.cta };
}

/** Cleans a model's script: right number of captions, short lines, sensible lengths. */
export function normaliseScript(raw: Partial<Record<keyof VideoScript, unknown>> | null, fallback: VideoScript, photos: number): VideoScript {
  const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const captions = Array.isArray(raw?.captions) ? raw!.captions.map((line) => clean(line, 48)).filter(Boolean) : [];
  const count = Math.max(1, photos);
  return {
    captions: Array.from({ length: count }, (_, i) => captions[i] ?? fallback.captions[i % fallback.captions.length]),
    voiceover: clean(raw?.voiceover, 320) || fallback.voiceover,
    cta: clean(raw?.cta, 40) || fallback.cta,
  };
}

/**
 * Seconds per photo and for the end card. The reel runs as long as the voiceover (plus a beat),
 * with each photo on screen for 1.8 to 5 seconds; without a voiceover, 2.6 seconds a photo.
 */
export function reelTimeline(photos: number, voiceSeconds: number | null) {
  const count = Math.max(1, photos);
  const endCard = 2.2;
  const perPhoto = voiceSeconds && voiceSeconds > 0 ? Math.min(5, Math.max(1.8, (voiceSeconds + 0.6 - endCard) / count)) : 2.6;
  return { perPhoto, endCard, total: perPhoto * count + endCard };
}
