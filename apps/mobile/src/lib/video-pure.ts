// Video studio on the phone (web /home/video): the hub's lists and the studio's settings, without React Native so
// tests/mobile-video.test.mjs can check them. The saved settings are the same VideoConfig the web studio keeps
// (shared/video-projects.ts), so a draft started on the phone opens on the web exactly as it was left.
// The finished reel is drawn in a browser (canvas + MediaRecorder, src/lib/video/render-reel.ts); the server has no
// renderer, so the phone saves the whole draft and the seller presses "Make my reel" on the web.

import { fallbackScript, MAX_PHOTOS, VIDEO_LANGUAGES, type VideoLanguage, type VideoScript } from "../../../../shared/video.ts";
import { defaultMood, isMusicMood, isReelTemplate, REEL_SHOT_LOOKS, type MusicMood, type ReelShotLook, type ReelTemplateId } from "../../../../shared/video-style.ts";
import { videoPlacesFor, videoPurposesFor, videoWithoutShop, webVideoStudioPath } from "../../../../shared/video-owner.ts";

// Delivery partners make videos too: their projects belong to their LogisticsPartner (shared/video-owner.ts), they
// start "ad" or "social" videos only, and finish them on the web at /logistics/video/studio.
export { videoPlacesFor, videoPurposesFor, videoWithoutShop };

export { MAX_PHOTOS };
export type { VideoLanguage, VideoScript };

export const VIDEO_PURPOSES = ["ad", "product", "social"] as const;
export type VideoPurpose = (typeof VIDEO_PURPOSES)[number];
export const VIDEO_STATUSES = ["draft", "saved", "published"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Same as PURPOSE_DEFAULTS in shared/video-projects.ts (that file needs zod, which the app doesn't ship). */
export const PURPOSE_DEFAULTS: Record<VideoPurpose, { template: ReelTemplateId; music: MusicMood; cta: string }> = {
  ad: { template: "words", music: "afrobeats", cta: "Shop now" },
  product: { template: "float", music: "chill", cta: "Tap to order" },
  social: { template: "pop", music: "amapiano", cta: "Follow for more" },
};

/** The studio settings saved with a project (VideoConfigSchema in shared/video-projects.ts). */
export interface VideoConfig {
  template?: ReelTemplateId;
  photos?: string[];
  name?: string;
  price?: string;
  language?: string;
  script?: VideoScript | null;
  voiceSource?: string;
  gender?: string;
  music?: string;
  musicVolume?: number;
  look?: string;
}

export interface VideoRow {
  id: string;
  title: string;
  purpose: string;
  status: string;
  productId: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  seconds: number | null;
  updatedAt: string;
  config: unknown;
  publishedTo?: unknown;
}

export function readPurpose(value: unknown): VideoPurpose {
  return typeof value === "string" && (VIDEO_PURPOSES as readonly string[]).includes(value) ? (value as VideoPurpose) : "social";
}

export function readStatus(value: unknown): VideoStatus {
  return value === "saved" || value === "published" ? value : "draft";
}

/** The saved settings, keeping only what the studio understands. */
export function readConfig(value: unknown): VideoConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof raw[key] === "string" ? (raw[key] as string).slice(0, max) : undefined);
  const out: VideoConfig = {};
  if (isReelTemplate(raw.template)) out.template = raw.template;
  if (Array.isArray(raw.photos)) out.photos = raw.photos.filter((url): url is string => typeof url === "string" && Boolean(url)).slice(0, MAX_PHOTOS);
  for (const [key, max] of [["name", 160], ["price", 40], ["language", 20], ["voiceSource", 20], ["gender", 10], ["music", 20], ["look", 20]] as const) {
    const value = text(key, max);
    if (value !== undefined) out[key] = value;
  }
  if (typeof raw.musicVolume === "number" && raw.musicVolume >= 0 && raw.musicVolume <= 1) out.musicVolume = raw.musicVolume;
  const script = raw.script as Partial<VideoScript> | null | undefined;
  if (script === null) out.script = null;
  else if (script && typeof script === "object" && Array.isArray(script.captions)) {
    out.script = { captions: script.captions.filter((line) => typeof line === "string").slice(0, MAX_PHOTOS), voiceover: typeof script.voiceover === "string" ? script.voiceover : "", cta: typeof script.cta === "string" ? script.cta : "" };
  }
  return out;
}

// ─── Hub ─────────────────────────────────────────────────────────────────────

/** The picture on a video's card: its cover, else its first photo. */
export function videoCover(row: Pick<VideoRow, "posterUrl" | "config">): string | null {
  return row.posterUrl ?? readConfig(row.config).photos?.[0] ?? null;
}

export function countByStatus(rows: Pick<VideoRow, "status">[]): Record<VideoStatus, number> {
  const counts: Record<VideoStatus, number> = { draft: 0, saved: 0, published: 0 };
  for (const row of rows) counts[readStatus(row.status)] += 1;
  return counts;
}

/** The tab the hub opens on: drafts when there are any (or nothing yet), else the first tab with videos. */
export function firstTab(rows: Pick<VideoRow, "status">[]): VideoStatus {
  const counts = countByStatus(rows);
  return counts.draft || !rows.length ? "draft" : counts.saved ? "saved" : "published";
}

export function videosIn<T extends Pick<VideoRow, "status">>(rows: T[], status: VideoStatus): T[] {
  return rows.filter((row) => readStatus(row.status) === status);
}

/** Where a published video went (product page, ad, social), once each. */
export function publishedKinds(value: unknown): ("product" | "ad" | "social")[] {
  if (!Array.isArray(value)) return [];
  const kinds: ("product" | "ad" | "social")[] = [];
  for (const entry of value) {
    const kind = entry && typeof entry === "object" ? (entry as { kind?: unknown }).kind : null;
    if ((kind === "product" || kind === "ad" || kind === "social") && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

export function shareMessage(title: string, url: string) {
  return title.trim() ? `${title.trim()}\n${url}` : url;
}

// ─── Studio ──────────────────────────────────────────────────────────────────

/** Voices the phone offers. Rex reads the words in the finished video; recording or uploading your own is on the web. */
export const PHONE_VOICES = ["rex", "none"] as const;
export type VoiceChoice = "rex" | "elevenlabs" | "record" | "upload" | "none";

export interface StudioProduct {
  id: string;
  name: string;
  images: string[];
  /** The price as it shows on the reel, e.g. "₦29,500". */
  priceText: string;
  retailPrice: number;
  description: string;
}

export interface StudioState {
  productId: string | null;
  photos: string[];
  name: string;
  price: string;
  language: VideoLanguage;
  script: VideoScript | null;
  template: ReelTemplateId;
  look: ReelShotLook;
  voiceSource: VoiceChoice;
  gender: "female" | "male";
  music: MusicMood | "none";
  musicVolume: number;
  /** The seller picked the music; until then it follows the style. */
  musicTouched: boolean;
}

const isLanguage = (value: unknown): value is VideoLanguage => VIDEO_LANGUAGES.some((option) => option.key === value);
const VOICES: readonly VoiceChoice[] = ["rex", "elevenlabs", "record", "upload", "none"];

/** Where the studio starts: the saved draft's settings, else the product's photos, name and price, else the purpose's defaults. */
export function initialStudio(purpose: VideoPurpose, config: VideoConfig | null, product: StudioProduct | null, productId: string | null = product?.id ?? null): StudioState {
  const defaults = PURPOSE_DEFAULTS[purpose];
  const saved = config ?? {};
  const savedMusic = saved.music === "none" || isMusicMood(saved.music) ? (saved.music as MusicMood | "none") : null;
  return {
    productId: product?.id ?? productId,
    photos: saved.photos?.length ? saved.photos.slice(0, MAX_PHOTOS) : product ? product.images.slice(0, MAX_PHOTOS) : [],
    name: saved.name ?? product?.name ?? "",
    price: saved.price ?? product?.priceText ?? "",
    language: isLanguage(saved.language) ? saved.language : "pidgin",
    script: saved.script ?? null,
    template: saved.template ?? defaults.template,
    look: (REEL_SHOT_LOOKS as readonly string[]).includes(saved.look ?? "") ? (saved.look as ReelShotLook) : "cutout",
    voiceSource: (VOICES as readonly string[]).includes(saved.voiceSource ?? "") ? (saved.voiceSource as VoiceChoice) : "rex",
    gender: saved.gender === "male" ? "male" : "female",
    music: savedMusic ?? defaults.music,
    musicVolume: typeof saved.musicVolume === "number" ? saved.musicVolume : 0.7,
    musicTouched: Boolean(savedMusic),
  };
}

/** What gets saved (the web's VideoConfig, so the web studio opens it as it was). */
export function studioConfig(state: StudioState): VideoConfig {
  return {
    template: state.template,
    photos: state.photos.filter((url) => /^https?:\/\//.test(url)).slice(0, MAX_PHOTOS),
    name: state.name,
    price: state.price,
    language: state.language,
    script: state.script,
    voiceSource: state.voiceSource,
    gender: state.gender,
    music: state.music,
    musicVolume: state.musicVolume,
    look: state.look,
  };
}

/** Only save once there is something to keep (a photo or a name), or the project already exists. */
export function worthSaving(state: StudioState, projectId: string | null) {
  return Boolean(projectId) || state.photos.length > 0 || state.name.trim().length > 0;
}

/** The music follows the style until the seller picks one (a new video starts with its purpose's music). */
export function withTemplate(state: StudioState, template: ReelTemplateId, purpose: VideoPurpose): StudioState {
  const defaults = PURPOSE_DEFAULTS[purpose];
  const music = state.musicTouched ? state.music : template === defaults.template ? defaults.music : defaultMood(template);
  return { ...state, template, music };
}

/** A new product swaps in its photos, name and price, and clears the old words. */
export function withProduct(state: StudioState, product: StudioProduct): StudioState {
  return { ...state, productId: product.id, photos: product.images.slice(0, MAX_PHOTOS), name: product.name, price: product.priceText, script: null };
}

/** Adds photos at the end, skipping ones already in, up to MAX_PHOTOS. */
export function addPhotos(photos: string[], urls: string[]): string[] {
  const out = [...photos];
  for (const url of urls) if (url && !out.includes(url) && out.length < MAX_PHOTOS) out.push(url);
  return out;
}

/** The words in use: the seller's (or Rex's) script, else a starter script so the studio always has something. */
export function currentScript(state: StudioState, purpose: VideoPurpose, storeName = ""): VideoScript {
  if (state.script) return state.script;
  const starter = fallbackScript(state.name.trim() || storeName || "this", state.price, state.language, state.photos.length);
  return purpose === "product" ? starter : { ...starter, cta: PURPOSE_DEFAULTS[purpose].cta };
}

/** One caption per photo (at least one), repeating the script's lines when there are more photos than lines. */
export function captionsFor(state: StudioState, purpose: VideoPurpose, storeName = ""): string[] {
  const base = state.script ?? currentScript(state, purpose, storeName);
  return Array.from({ length: Math.max(1, state.photos.length) }, (_, i) => base.captions[i] ?? base.captions[i % Math.max(1, base.captions.length)] ?? "");
}

/** Changes one caption, keeping the rest of the words. */
export function withCaption(state: StudioState, purpose: VideoPurpose, index: number, text: string, storeName = ""): StudioState {
  const captions = captionsFor(state, purpose, storeName);
  captions[index] = text.slice(0, 48);
  return { ...state, script: { ...currentScript(state, purpose, storeName), captions } };
}

export function withScriptField(state: StudioState, purpose: VideoPurpose, field: "voiceover" | "cta", text: string, storeName = ""): StudioState {
  const script = currentScript(state, purpose, storeName);
  const captions = captionsFor(state, purpose, storeName);
  return { ...state, script: { ...script, captions, [field]: text.slice(0, field === "cta" ? 40 : 600) } };
}

/** Rex's "Make shots" answer applied: each photo swapped for its new shot where Rex made one. */
export function applyShots(photos: string[], shots: { source: string; url: string | null; error?: string }[]) {
  const made = shots.filter((shot) => shot.url);
  return {
    photos: photos.map((photo) => shots.find((shot) => shot.source === photo && shot.url)?.url ?? photo),
    made: made.length,
    total: shots.length,
    firstProblem: shots.find((shot) => !shot.url)?.error ?? null,
  };
}

/** The voices to offer: Rex or none, plus the draft's own choice when it was made on the web. */
export function voiceChoices(current: VoiceChoice): VoiceChoice[] {
  return (PHONE_VOICES as readonly VoiceChoice[]).includes(current) ? [...PHONE_VOICES] : [...PHONE_VOICES, current];
}

/** The web studio for one project, where the reel is made ("Finish on the web"): /logistics/video/studio for a partner. */
export function webStudioPath(id: string, role?: string | null) {
  return webVideoStudioPath(role ?? "seller", id);
}

/** A Rex Studio video card as a new project: his words for the product, ready in the studio. */
export function rexCardProject(card: { product: { id: string; name: string }; script: { captions: string[]; voiceover: string; cta: string } }) {
  return {
    purpose: "social" as const,
    productId: card.product.id,
    config: { name: card.product.name, script: { captions: card.script.captions.slice(0, MAX_PHOTOS).map((line) => line.slice(0, 80)), voiceover: card.script.voiceover.slice(0, 600), cta: card.script.cta.slice(0, 60) } },
  };
}

/**
 * The app screen for a web video link: /home/video → the hub; /home/video/studio?id=… → that draft;
 * ?purpose=…&product=… (and the hub's ?product=…) → a new video. Null for anything else.
 */
export function videoScreenFor(path: string): { pathname: "/video" | "/video/studio"; params: Record<string, string> } | null {
  const [pathname, query = ""] = path.split("#")[0].split("?");
  const clean = pathname.replace(/\/$/, "");
  if (clean !== "/home/video" && clean !== "/home/video/studio") return null;
  const search = new URLSearchParams(query);
  const params: Record<string, string> = {};
  for (const key of ["id", "purpose", "product"]) {
    const value = search.get(key);
    if (value) params[key] = value;
  }
  if (clean === "/home/video" && !params.product) return { pathname: "/video", params: {} };
  if (clean === "/home/video" && params.product) return { pathname: "/video/studio", params: { purpose: "product", product: params.product } };
  return { pathname: "/video/studio", params };
}
