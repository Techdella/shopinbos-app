// Rex and Peggy: which still and which animation file stands in for each mood (build spec 5.4).
// Pure, shared by the web <Mascot> (src/components/brand/Mascot.tsx) and the native one
// (apps/mobile/src/components/Mascot.tsx), and unit-tested in tests/mascot.test.mjs.
//
// The owner is producing animated files. Until they land, every mood shows a still PNG with a gentle CSS / Animated
// fallback motion. When files arrive they are listed in a manifest (mascots.json, written by
// `node scripts/mascots-manifest.mjs`), and only listed files are ever requested, so nothing 404s or fails to bundle.

export const MASCOT_WHO = ["rex", "peggy"] as const;
export type MascotWho = (typeof MASCOT_WHO)[number];

export const MASCOT_MOODS = ["idle", "wave", "thinking", "working", "celebrate", "oops", "sleep"] as const;
export type MascotMood = (typeof MASCOT_MOODS)[number];

/** The sizes the spec designs for. Moods must read at 30 px. */
export const MASCOT_SIZES = [20, 30, 40, 56, 110, 150] as const;
export type MascotSize = (typeof MASCOT_SIZES)[number];

/** Still PNG names. Web serves them from /brand/app/<name>.png; mobile requires apps/mobile/assets/brand/<name>.png. */
export const MASCOT_STILL_NAMES = ["rex", "rex-side", "rex-cheer", "peggy", "peggy-wave", "peggy-side", "peggy-cheer"] as const;
export type MascotStillName = (typeof MASCOT_STILL_NAMES)[number];

/**
 * The best still for each mood. rex-side / peggy-side are the side-on renders (busy, looking at the work, or a little
 * sheepish), *-cheer the big smiles, and peggy-wave has her eyes shut, so it doubles as Peggy asleep.
 */
export const MASCOT_STILLS: Record<MascotWho, Record<MascotMood, MascotStillName>> = {
  rex: {
    idle: "rex",
    wave: "rex",
    thinking: "rex-side",
    working: "rex-side",
    celebrate: "rex-cheer",
    oops: "rex",
    sleep: "rex",
  },
  peggy: {
    idle: "peggy",
    wave: "peggy-wave",
    thinking: "peggy-side",
    working: "peggy-side",
    celebrate: "peggy-cheer",
    oops: "peggy-side",
    sleep: "peggy-wave",
  },
};

export function mascotStill(who: MascotWho, mood: MascotMood = "idle"): MascotStillName {
  return MASCOT_STILLS[who]?.[mood] ?? MASCOT_STILLS[who]?.idle ?? "rex";
}

export function mascotLabel(who: MascotWho) {
  return who === "peggy" ? "Peggy" : "Rex";
}

/** celebrate, wave and oops play once and then settle back to idle; the rest loop. */
export const ONE_SHOT_MOODS: ReadonlySet<MascotMood> = new Set(["celebrate", "wave", "oops"]);
export function playsOnce(mood: MascotMood) {
  return ONE_SHOT_MOODS.has(mood);
}

/** The manifest of animation files that actually exist (file names only, e.g. "rex.riv", "peggy-celebrate.json"). */
export interface MascotManifest {
  files: string[];
}

export type MascotRendererKind = "rive" | "lottie";
export type MascotRenderers = Partial<Record<MascotRendererKind, boolean>>;

export interface MascotAnimationSource {
  kind: MascotRendererKind;
  file: string;
  /** Rive: one file per mascot with a state machine whose `mood` input picks the mood. */
  stateMachine?: string;
}

export const RIVE_STATE_MACHINE = "mood";

/**
 * The animation file for this mascot and mood, or null when there is none (or no renderer for it is installed).
 * Rive is preferred: one `<who>.riv` covers every mood. Otherwise a Lottie `<who>-<mood>.json`.
 */
export function mascotAnimation(who: MascotWho, mood: MascotMood, manifest: MascotManifest | null | undefined, renderers: MascotRenderers): MascotAnimationSource | null {
  const files = new Set(manifest?.files ?? []);
  if (renderers.rive && files.has(`${who}.riv`)) return { kind: "rive", file: `${who}.riv`, stateMachine: RIVE_STATE_MACHINE };
  if (renderers.lottie && files.has(`${who}-${mood}.json`)) return { kind: "lottie", file: `${who}-${mood}.json` };
  return null;
}

export interface MascotMotionContext {
  reducedMotion: boolean;
  /** Android phones under 3 GB of RAM (native only; the web skips this check). */
  lowEndDevice?: boolean;
}

/** Whether to load the real animation. When false the still shows (with the fallback motion unless reduced motion). */
export function shouldAnimate(source: MascotAnimationSource | null, ctx: MascotMotionContext) {
  return Boolean(source) && !ctx.reducedMotion && !ctx.lowEndDevice;
}

/** Whether the still may move with the gentle fallback motion (breathing, bounce, shake). */
export function shouldMoveStill(ctx: MascotMotionContext) {
  return !ctx.reducedMotion;
}

export const LOW_END_MEMORY_BYTES = 3 * 1024 ** 3;
export function isLowEndAndroid(platform: string, totalMemory: number | null | undefined) {
  return platform === "android" && typeof totalMemory === "number" && totalMemory > 0 && totalMemory < LOW_END_MEMORY_BYTES;
}

/** Lagos is UTC+1 all year (no daylight saving). */
export function lagosHour(now: Date = new Date()) {
  return (now.getUTCHours() + 1) % 24;
}

/** Night-time Home (10pm to 6am Lagos time): Peggy sleeps on the Home screen while she handles the chats. */
export function isPeggyNight(now: Date = new Date()) {
  const hour = lagosHour(now);
  return hour >= 22 || hour < 6;
}
