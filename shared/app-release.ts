// "Is there a newer phone app?" (pure: the server, Admin › App updates and the phone app all use it).
//
// The team sets two build numbers per platform in Admin › App updates (PlatformSetting "app.release.<platform>"):
//   latestBuild  the newest build live in the store. A phone on an older build is told a new version is ready
//                (a sheet it can put off for three days). 0 = nothing to say.
//   minBuild     the oldest build that still works. A phone below it sees a full-screen "Update now" it can't skip.
// Build numbers are Android's versionCode and iOS's build number (CFBundleVersion); EAS counts both up remotely and
// the app reads them with expo-application's nativeBuildVersion. The phone asks GET /api/mobile/app-release?platform=
// android|ios on launch and when it comes back to the front (at most once an hour). iPhones ask only when their build
// knows the App Store link (IOS_APP_STORE_URL below). Opening the store is not a purchase.

export const APP_RELEASE_PLATFORMS = ["android", "ios"] as const;
export type AppReleasePlatform = (typeof APP_RELEASE_PLATFORMS)[number];

export interface AppRelease {
  /** The newest build live in the store (0: nothing to prompt). */
  latestBuild: number;
  /** Builds below this must update before they can carry on (0: none). */
  minBuild: number;
  /** An optional line shown under the title ("Faster photos and a new Orders screen."). */
  message?: string;
}

export const DEFAULT_APP_RELEASE: AppRelease = { latestBuild: 0, minBuild: 0 };
export const APP_RELEASE_MESSAGE_MAX = 200;
/** Builds are versionCodes: Google Play's ceiling. */
export const APP_RELEASE_BUILD_MAX = 2_100_000_000;

export function appReleaseKey(platform: AppReleasePlatform) {
  return `app.release.${platform}`;
}

export function isAppReleasePlatform(value: unknown): value is AppReleasePlatform {
  return typeof value === "string" && (APP_RELEASE_PLATFORMS as readonly string[]).includes(value);
}

function build(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > APP_RELEASE_BUILD_MAX) return null;
  return n;
}

/** One line of plain text: no tags or control characters, spaces collapsed, capped. Empty → undefined. */
export function cleanReleaseMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]*>/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, APP_RELEASE_MESSAGE_MAX)
    .trim();
  return text || undefined;
}

/** A stored or fetched value as an AppRelease; anything unreadable is the default (nothing to prompt). */
export function parseAppRelease(value: unknown): AppRelease {
  if (!value || typeof value !== "object") return { ...DEFAULT_APP_RELEASE };
  const raw = value as Record<string, unknown>;
  const latestBuild = build(raw.latestBuild) ?? 0;
  // A minimum above the latest makes no sense (nobody could reach it): held at the latest.
  const minBuild = Math.min(build(raw.minBuild) ?? 0, latestBuild);
  const message = cleanReleaseMessage(raw.message);
  return message ? { latestBuild, minBuild, message } : { latestBuild, minBuild };
}

/** Admin › App updates form → a release to save, or a plain reason it can't be saved. */
export function validateAppReleaseInput(input: { latestBuild?: unknown; minBuild?: unknown; message?: unknown }): { ok: true; release: AppRelease } | { ok: false; error: string } {
  const empty = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  const latestBuild = empty(input.latestBuild) ? 0 : build(input.latestBuild);
  if (latestBuild === null) return { ok: false, error: "The latest build must be a whole number (the versionCode, e.g. 42), or 0." };
  const minBuild = empty(input.minBuild) ? 0 : build(input.minBuild);
  if (minBuild === null) return { ok: false, error: "The minimum build must be a whole number (the versionCode), or 0." };
  if (minBuild > latestBuild) return { ok: false, error: "The minimum build can't be higher than the latest build: nobody could update to it." };
  const message = cleanReleaseMessage(input.message);
  return { ok: true, release: message ? { latestBuild, minBuild, message } : { latestBuild, minBuild } };
}

export type UpdateState = "required" | "available" | "current";

/** What this phone should see. An unknown build (web, a dev build, an unreadable number) is always "current". */
export function updateState(currentBuild: number | string | null | undefined, release: AppRelease | null | undefined): UpdateState {
  const current = typeof currentBuild === "string" ? (/^\d+$/.test(currentBuild.trim()) ? Number(currentBuild.trim()) : NaN) : currentBuild;
  if (typeof current !== "number" || !Number.isFinite(current) || current <= 0 || !release) return "current";
  if (release.minBuild > 0 && current < release.minBuild) return "required";
  if (release.latestBuild > 0 && current < release.latestBuild) return "available";
  return "current";
}

// ─── Where "Update now" goes ───────────────────────────────────────────────────

export const ANDROID_PACKAGE = "com.shopinbos.app";
export const PLAY_STORE_MARKET_URL = `market://details?id=${ANDROID_PACKAGE}`;
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
/** App Store Connect's Apple ID for the iPhone app (apps/mobile/eas.json submit.production.ios.ascAppId). */
export const IOS_APP_STORE_ID = "6828637131";
/** The App Store listing (opens the App Store app on iPhones). EXPO_PUBLIC_IOS_APP_STORE_URL can override it. */
export const IOS_APP_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`;

/**
 * The links to try in order: the Play Store app first, then the Play Store website. iOS: the App Store link (it opens
 * the App Store app), or none (the phone does nothing) for a link that isn't an App Store one.
 */
export function storeUrls(platform: string, iosUrl: string | null | undefined = IOS_APP_STORE_URL): string[] {
  if (platform === "android") return [PLAY_STORE_MARKET_URL, PLAY_STORE_WEB_URL];
  if (platform === "ios") {
    const url = (iosUrl ?? "").trim();
    return /^https:\/\/(apps|itunes)\.apple\.com\//.test(url) ? [url] : [];
  }
  return [];
}

// ─── "Later" and how often to ask ──────────────────────────────────────────────

/** "Later" puts off the "new version" sheet for this long, for that build (a newer build asks again). */
export const UPDATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** Coming back to the front checks again at most this often. */
export const UPDATE_CHECK_EVERY_MS = 60 * 60 * 1000;

export interface UpdateSnooze {
  build: number;
  at: number;
}

export function snoozeFor(latestBuild: number, now: number): UpdateSnooze {
  return { build: latestBuild, at: now };
}

export function parseSnooze(raw: string | null | undefined): UpdateSnooze | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<UpdateSnooze>;
    return typeof value?.build === "number" && typeof value?.at === "number" ? { build: value.build, at: value.at } : null;
  } catch {
    return null;
  }
}

/** True when the "new version" sheet may show now: never put off for this build, or put off over three days ago. */
export function availablePromptDue(snooze: UpdateSnooze | null, latestBuild: number, now: number): boolean {
  if (!snooze || snooze.build !== latestBuild) return true;
  return now - snooze.at >= UPDATE_SNOOZE_MS || now < snooze.at;
}

/** True when it's time to ask the server again (first time, or an hour since the last ask). */
export function releaseCheckDue(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt === null || now - lastCheckedAt >= UPDATE_CHECK_EVERY_MS || now < lastCheckedAt;
}
