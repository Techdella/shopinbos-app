// How the seller wants Rex (the store designer) to work: Settings > Peggy & Rex. Saved in
// Store.brandSettings.rexPreferences (private, never sent to shoppers) and read into Rex's prompts.
// Pure, unit-tested in tests/find-products.test.mjs.

import { z } from "zod";

export const REX_MODES = [
  { value: "ask", label: "Ask before changing", hint: "Rex tells you the plan and waits for your OK." },
  { value: "apply", label: "Apply and let me undo", hint: "Rex makes the change straight away. Undo any time." },
] as const;

export const REX_DESIGN_STYLES = [
  { value: "clean", label: "Clean & minimal", prompt: "clean and minimal: plenty of white space, one accent colour, simple type, few sections" },
  { value: "bold", label: "Bold & colourful", prompt: "bold and colourful: strong colour blocks, big headlines, confident contrast" },
  { value: "luxury", label: "Luxury", prompt: "luxury: calm dark or cream backgrounds, serif headings, gold or muted accents, generous spacing" },
  { value: "playful", label: "Playful", prompt: "playful: bright friendly colours, rounded corners, light-hearted headlines" },
  { value: "brand_kit", label: "Match my brand kit", prompt: "match the store's brand kit: keep its logo colours and fonts, don't introduce new ones" },
] as const;

export const REX_IMAGE_STYLES = [
  { value: "studio", label: "Studio white", prompt: "clean studio shots on a plain white or light background" },
  { value: "lifestyle", label: "Lifestyle with African models", prompt: "lifestyle photos with African models in real Nigerian settings" },
  { value: "flat_lay", label: "Flat lay", prompt: "flat-lay photos shot from above on a simple surface" },
  { value: "match", label: "Match my photos", prompt: "the same look, light and background as the seller's own product photos" },
] as const;

export const REX_VOICES = [
  { value: "warm_naija", label: "Warm Naija", prompt: "warm and friendly, the way a Nigerian shop owner talks to a regular customer" },
  { value: "professional", label: "Professional", prompt: "professional and clear, no slang" },
  { value: "playful", label: "Playful", prompt: "playful and upbeat" },
  { value: "punchy", label: "Short and punchy", prompt: "short and punchy: few words, short sentences" },
] as const;

export const REX_LANGUAGES = [
  { value: "english", label: "English", prompt: "Write in plain English." },
  { value: "pidgin_touches", label: "English + Pidgin touches", prompt: "Write in English with light Nigerian Pidgin touches in headlines and buttons (for example \"No wahala\", \"Oya, shop now\"); keep product details and prices in plain English." },
] as const;

export const REX_KEEP_VERSIONS = [5, 10, 20] as const;
/** With auto-save off Rex still keeps the original and the last change, so Undo works. */
export const REX_MIN_VERSIONS = 2;

type Values<T extends ReadonlyArray<{ value: string }>> = T[number]["value"];
const values = <T extends ReadonlyArray<{ value: string }>>(list: T) => list.map((item) => item.value) as [Values<T>, ...Values<T>[]];

export const RexPreferencesSchema = z.object({
  mode: z.enum(values(REX_MODES)),
  designStyle: z.enum(values(REX_DESIGN_STYLES)),
  imageStyle: z.enum(values(REX_IMAGE_STYLES)),
  voice: z.enum(values(REX_VOICES)),
  language: z.enum(values(REX_LANGUAGES)),
  autoSaveVersions: z.boolean(),
  keepVersions: z.number().int().min(REX_MIN_VERSIONS).max(20),
  brandNotes: z.string().trim().max(2000),
});

export type RexPreferences = z.infer<typeof RexPreferencesSchema>;

/** What Rex does before the seller chooses anything (the same as Rex has always worked). */
export const DEFAULT_REX_PREFERENCES: RexPreferences = {
  mode: "apply",
  designStyle: "brand_kit",
  imageStyle: "studio",
  voice: "warm_naija",
  language: "english",
  autoSaveVersions: true,
  keepVersions: 20,
  brandNotes: "",
};

/** Saved preferences, field by field: anything missing or invalid falls back on the default. */
export function parseRexPreferences(raw: unknown): RexPreferences {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const shape = RexPreferencesSchema.shape;
  const out = { ...DEFAULT_REX_PREFERENCES } as Record<keyof RexPreferences, unknown>;
  for (const key of Object.keys(shape) as Array<keyof RexPreferences>) {
    const parsed = shape[key].safeParse(value[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as RexPreferences;
}

/** Validates the settings form (FormData entries as strings). */
export function rexPreferencesFromForm(form: Record<string, FormDataEntryValue | null | undefined>) {
  const str = (key: string) => (typeof form[key] === "string" ? (form[key] as string) : "");
  return RexPreferencesSchema.safeParse({
    mode: str("mode"),
    designStyle: str("designStyle"),
    imageStyle: str("imageStyle"),
    voice: str("voice"),
    language: str("language"),
    autoSaveVersions: str("autoSaveVersions") === "on",
    keepVersions: Number(str("keepVersions")),
    brandNotes: str("brandNotes"),
  });
}

/** How many Rex Studio versions to keep. */
export function rexVersionLimit(prefs: RexPreferences) {
  return prefs.autoSaveVersions ? prefs.keepVersions : REX_MIN_VERSIONS;
}

/** Version limit straight from Store.brandSettings. */
export function rexVersionLimitFor(brandSettings: unknown) {
  const settings = brandSettings && typeof brandSettings === "object" ? (brandSettings as Record<string, unknown>) : {};
  return rexVersionLimit(parseRexPreferences(settings.rexPreferences));
}

const pick = <T extends ReadonlyArray<{ value: string; prompt: string }>>(list: T, value: string) => list.find((item) => item.value === value)?.prompt ?? "";

/** Instructions for Rex's prompts. */
export function rexPreferenceLines(prefs: RexPreferences): string[] {
  return [
    prefs.mode === "ask"
      ? "Ask before changing: when the seller asks for something broad or open (\"make it nicer\", \"redesign the homepage\"), describe what you would change in one or two sentences and ask them to confirm instead of changing it. A specific instruction (\"make the button green\") or a yes to your plan counts as confirmation."
      : "Apply and let me undo: make the changes straight away; the seller can undo any version.",
    `Design style: ${pick(REX_DESIGN_STYLES, prefs.designStyle)}.`,
    `Photos you generate or describe: ${pick(REX_IMAGE_STYLES, prefs.imageStyle)}.`,
    `Copy voice: ${pick(REX_VOICES, prefs.voice)}.`,
    pick(REX_LANGUAGES, prefs.language),
    prefs.brandNotes ? `What the seller says about their brand: ${prefs.brandNotes.replace(/\s+/g, " ").slice(0, 1200)}` : "",
  ].filter(Boolean);
}

/**
 * The block added to Rex's prompts, from Store.brandSettings. Empty until the seller has saved their Rex
 * settings, so Rex keeps working as before for everyone else.
 */
export function rexPreferencesBlock(brandSettings: unknown) {
  const settings = brandSettings && typeof brandSettings === "object" ? (brandSettings as Record<string, unknown>) : {};
  if (!settings.rexPreferences || typeof settings.rexPreferences !== "object") return "";
  const lines = rexPreferenceLines(parseRexPreferences(settings.rexPreferences));
  return `The seller's Rex settings (follow these unless the seller asks otherwise in this conversation):\n${lines.map((line) => `- ${line}`).join("\n")}`;
}
