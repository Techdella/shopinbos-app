// Video studio styles: the reel templates, the voice choices and the background music moods. The templates are
// Shopinbos's own designs, modelled on the patterns of product reels trending on Pinterest (floating product,
// big type, colour pops, word punches, collages); no one else's footage is used. Pure, unit-tested in
// tests/behaviour.test.mjs.

export const REEL_TEMPLATES = [
  {
    id: "float",
    name: "Float",
    blurb: "Your product floats on a soft brand-colour backdrop with one-word captions. Calm and premium.",
    pace: 2.6,
    cutout: true,
  },
  {
    id: "bold",
    name: "Big type",
    blurb: "A giant word in your brand colour behind the product. Loud, simple, made for food and fashion.",
    pace: 2.2,
    cutout: true,
  },
  {
    id: "pop",
    name: "Colour pop",
    blurb: "Each shot on its own brand colour, the product on a card, with round wipes between. Fun and bright.",
    pace: 2.1,
    cutout: true,
  },
  {
    id: "words",
    name: "Word punch",
    blurb: "Fast cuts: one bold word on a colour block, then the photo. Great for sales and launches.",
    pace: 1.9,
    cutout: false,
  },
  {
    id: "grid",
    name: "Collage",
    blurb: "Opens on a grid of your photos, then each one fills the screen. Shows off a range or a collection.",
    pace: 2.4,
    cutout: false,
  },
  {
    id: "classic",
    name: "Slideshow",
    blurb: "Full-screen photos with a slow zoom and captions. Works with any photos.",
    pace: 2.6,
    cutout: false,
  },
] as const;

export type ReelTemplateId = (typeof REEL_TEMPLATES)[number]["id"];
export const REEL_TEMPLATE_IDS = REEL_TEMPLATES.map((template) => template.id) as unknown as readonly [ReelTemplateId, ...ReelTemplateId[]];

/** Shown under the template picker: where the styles come from. */
export const REEL_TEMPLATE_CREDIT = "Styles inspired by trending product reels on Pinterest, redrawn by Shopinbos. Your reel uses only your own photos.";

export function isReelTemplate(value: unknown): value is ReelTemplateId {
  return typeof value === "string" && REEL_TEMPLATES.some((template) => template.id === value);
}

export function reelTemplate(id: string | null | undefined) {
  return REEL_TEMPLATES.find((template) => template.id === id) ?? REEL_TEMPLATES[0];
}

/**
 * Seconds per shot, for the intro (collage only) and the end card. With a voiceover the reel runs as long as the
 * voice plus a beat, each shot between 1.4 and 5 seconds; without one, the template's own pace.
 */
export function styledTimeline(template: ReelTemplateId, shots: number, voiceSeconds: number | null) {
  const count = Math.max(1, shots);
  const pace = reelTemplate(template).pace;
  const intro = template === "grid" ? 1.8 : 0;
  const endCard = 2.4;
  const perShot = voiceSeconds && voiceSeconds > 0 ? Math.min(5, Math.max(1.4, (voiceSeconds + 0.8 - endCard - intro) / count)) : pace;
  return { intro, perShot, endCard, total: intro + perShot * count + endCard };
}

// ─── Voice ─────────────────────────────────────────────────────────────────────

export const VOICE_SOURCES = ["rex", "elevenlabs", "record", "upload", "none"] as const;
export type VoiceSource = (typeof VOICE_SOURCES)[number];

export const VOICE_GENDERS = ["female", "male"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export function isVoiceGender(value: unknown): value is VoiceGender {
  return typeof value === "string" && (VOICE_GENDERS as readonly string[]).includes(value);
}

/** OpenAI voices: the expressive model first, then the older tts-1 voices as a fallback. */
export function openAiVoice(gender: VoiceGender, model: "expressive" | "basic") {
  if (model === "expressive") return gender === "male" ? "ash" : "coral";
  return gender === "male" ? "onyx" : "nova";
}

const ACCENT: Record<string, string> = {
  english: "Speak English with a warm, natural Nigerian accent, like a friendly Lagos shop owner talking to a customer.",
  pidgin: "Speak Nigerian Pidgin with a relaxed, playful Lagos accent.",
  yoruba: "Speak Yorùbá with a native Nigerian accent and the correct tones.",
  hausa: "Speak Hausa with a native northern Nigerian accent.",
  igbo: "Speak Igbo with a native south-eastern Nigerian accent.",
};

/** How the voice should sound (OpenAI's expressive voices follow this). */
export function voiceDirection(language: string, gender: VoiceGender) {
  const who = gender === "male" ? "A confident, friendly Nigerian man" : "A warm, upbeat Nigerian woman";
  return `${who} doing a short product ad for social media. ${ACCENT[language] ?? ACCENT.english} Lively but natural pace, clear words, a smile in the voice, no American or British accent.`;
}

// ─── Music ─────────────────────────────────────────────────────────────────────

/** Background music made in the browser for each reel (original, so free to post anywhere). */
export const MUSIC_MOODS = [
  { id: "afrobeats", name: "Afrobeats", bpm: 104 },
  { id: "amapiano", name: "Amapiano", bpm: 112 },
  { id: "upbeat", name: "Upbeat pop", bpm: 120 },
  { id: "chill", name: "Chill", bpm: 88 },
  { id: "luxury", name: "Luxury", bpm: 76 },
] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number]["id"];

export function isMusicMood(value: unknown): value is MusicMood {
  return typeof value === "string" && MUSIC_MOODS.some((mood) => mood.id === value);
}

/** The music mood that suits a template, so a reel sounds right before the seller picks one. */
export function defaultMood(template: ReelTemplateId): MusicMood {
  return template === "float" || template === "classic" ? "chill" : template === "bold" || template === "words" ? "afrobeats" : template === "pop" ? "upbeat" : "amapiano";
}

/** Music level under a voice (ducked) and on its own, 0..1. */
export function musicLevels(volume: number, hasVoice: boolean) {
  const v = Math.max(0, Math.min(1, volume));
  return { base: v * 0.7, underVoice: hasVoice ? v * 0.22 : v * 0.7 };
}

// ─── Brand ─────────────────────────────────────────────────────────────────────

export interface ReelBrand {
  /** Main brand colour (buttons, big type). */
  primary: string;
  /** Second colour (banners, alternate backgrounds). */
  secondary: string;
  /** Page background. */
  background: string;
  /** Text colour on the background. */
  ink: string;
  logoUrl: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Black or white text, whichever reads better on the colour. */
export function textOn(hex: string) {
  if (!HEX.test(hex)) return "#FFFFFF";
  const l = luminance(hex);
  return (1.05 / (l + 0.05)) >= ((l + 0.05) / 0.0611) ? "#FFFFFF" : "#16141F";
}

/** A brand palette with safe fallbacks, from the store's colours (any can be missing or not #RRGGBB). */
export function reelBrand(colours: Partial<Record<"accent" | "button" | "hero" | "paper" | "ink", string | null>> | null, logoUrl: string | null): ReelBrand {
  const pick = (value: string | null | undefined, fallback: string) => (value && HEX.test(value) ? value.toUpperCase() : fallback);
  const primary = pick(colours?.button ?? colours?.accent, "#FF6A2B");
  const secondary = pick(colours?.hero, "#16141F");
  return {
    primary,
    secondary: secondary === primary ? pick(colours?.accent, "#16141F") : secondary,
    background: pick(colours?.paper, "#F6F2EA"),
    ink: pick(colours?.ink, "#16141F"),
    logoUrl,
  };
}

/** The colours a "Colour pop" reel cycles through: brand colours first, then a lighter tint of the primary. */
export function popColours(brand: ReelBrand) {
  return [brand.primary, brand.secondary, brand.background].filter((colour, index, all) => all.indexOf(colour) === index);
}

// ─── Shots Rex makes for a reel ────────────────────────────────────────────────

/** cutout: see-through background (floats on the template); studio: clean backdrop in the brand colour; brand: an ad shot with the logo. */
export const REEL_SHOT_LOOKS = ["cutout", "studio", "brand"] as const;
export type ReelShotLook = (typeof REEL_SHOT_LOOKS)[number];

const KEEP = "Keep the product exactly the same: same shape, colours, text, labels and logo on it. Do not add words.";

export function reelShotPrompt(look: ReelShotLook, input: { product: string | null; colours: { accent?: string; paper?: string; hero?: string } | null }) {
  const what = input.product ? `the ${input.product}` : "the product";
  if (look === "cutout") return `Cut out ${what} from this photo: remove the background completely so it is transparent, clean crisp edges, fix the lighting and colour so it looks professionally shot. ${KEEP}`;
  if (look === "studio") {
    const backdrop = input.colours?.paper ? `a soft seamless studio backdrop in ${input.colours.paper} (a gentle tint of the brand colour ${input.colours.accent ?? input.colours.paper})` : "a soft seamless light studio backdrop";
    return `Clean up this product photo for a social media ad: remove clutter, fix the lighting and colour, and place ${what} on ${backdrop} with a soft natural shadow. Product centred, filling about two thirds of the frame, space above for text. Vertical 9:16 framing. ${KEEP}`;
  }
  return `A premium vertical (9:16) social media ad shot of ${what} from the reference photo, styled like a top Nigerian brand's Instagram post: bold backdrop in the brand colours, soft shadow, a few simple props that suit the product, the brand logo small in a top corner. Leave clear space at the top and bottom for captions. ${KEEP}`;
}
