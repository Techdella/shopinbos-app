// Video studio projects (/home/video): what each purpose starts with, and the studio settings saved with a draft.
// Pure, unit-tested in tests/behaviour.test.mjs.

import { z } from "zod";
import { REEL_TEMPLATE_IDS, type MusicMood, type ReelTemplateId } from "./video-style.ts";

export const VIDEO_PURPOSES = ["ad", "product", "social"] as const;
export type VideoPurpose = (typeof VIDEO_PURPOSES)[number];

export const VIDEO_STATUSES = ["draft", "saved", "published"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export function isVideoPurpose(value: unknown): value is VideoPurpose {
  return typeof value === "string" && (VIDEO_PURPOSES as readonly string[]).includes(value);
}

/** How a new video of each purpose starts: an ad is punchy with a strong call to action, a product video calm. */
export const PURPOSE_DEFAULTS: Record<VideoPurpose, { template: ReelTemplateId; music: MusicMood; cta: string }> = {
  ad: { template: "words", music: "afrobeats", cta: "Shop now" },
  product: { template: "float", music: "chill", cta: "Tap to order" },
  social: { template: "pop", music: "amapiano", cta: "Follow for more" },
};

const url = z.string().trim().max(2000);

/** The studio's settings, saved with a draft so the seller can come back to it. Unknown keys are dropped. */
export const VideoConfigSchema = z
  .object({
    template: z.enum(REEL_TEMPLATE_IDS).optional(),
    photos: z.array(url).max(6).optional(),
    name: z.string().max(160).optional(),
    price: z.string().max(40).optional(),
    language: z.string().max(20).optional(),
    script: z.object({ captions: z.array(z.string().max(80)).max(6), voiceover: z.string().max(600), cta: z.string().max(60) }).nullable().optional(),
    voiceSource: z.string().max(20).optional(),
    gender: z.string().max(10).optional(),
    accent: z.string().max(20).optional(),
    music: z.string().max(20).optional(),
    musicVolume: z.number().min(0).max(1).optional(),
    look: z.string().max(20).optional(),
  })
  .strip();
export type VideoConfig = z.infer<typeof VideoConfigSchema>;

export function readVideoConfig(value: unknown): VideoConfig {
  const parsed = VideoConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** A title from what the seller made, e.g. "Ankara tote ad" or "Social video, 15 Oct". */
export function videoTitle(purpose: VideoPurpose, productName: string | null | undefined, now = new Date()) {
  const word = purpose === "ad" ? "ad" : purpose === "product" ? "product video" : "social video";
  if (productName?.trim()) return `${productName.trim().slice(0, 80)} ${word}`;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(now);
  return `${word[0].toUpperCase()}${word.slice(1)}, ${date}`;
}

export interface PublishedEntry {
  kind: "product" | "ad" | "social";
  id?: string;
  at: string;
}

export function readPublished(value: unknown): PublishedEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PublishedEntry => Boolean(entry) && typeof entry === "object" && ["product", "ad", "social"].includes((entry as PublishedEntry).kind) && typeof (entry as PublishedEntry).at === "string");
}

/** Adds where a video went (once per place); a published video stays published. */
export function addPublished(list: PublishedEntry[], entry: Omit<PublishedEntry, "at">, now = new Date()): PublishedEntry[] {
  if (list.some((item) => item.kind === entry.kind && item.id === entry.id)) return list;
  return [...list, { ...entry, at: now.toISOString() }].slice(-20);
}
