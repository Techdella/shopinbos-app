import "expo-sqlite/localStorage/install";
import { Alert, Linking, Platform } from "react-native";
import * as Application from "expo-application";
import { API_URL } from "./api";
import { tNow } from "./app-locale";
import { parseAppRelease, parseSnooze, snoozeFor, storeUrls, type AppRelease, type AppReleasePlatform, type UpdateSnooze } from "@shared/app-release";

// "Is there a newer app?" (shared/app-release.ts, components/UpdatePrompt.tsx): this phone's build, the release the
// team set in Admin › App updates, "Later" remembered on this phone, and opening the store. Opening Google Play or
// the App Store is not a purchase. Nothing here throws: offline or a bad answer just means no prompt.

const SNOOZE_KEY = "shopinbos.update.snooze";
/** Web only (screenshots and testing; the web app has no store build): pretend to be this build / this release. */
const DEV_BUILD_KEY = "shopinbos.dev.appBuild";
const DEV_RELEASE_KEY = "shopinbos.dev.appRelease";
const TIMEOUT_MS = 8000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: "Later" just isn't remembered.
  }
}

/** The App Store listing this build opens (EXPO_PUBLIC_IOS_APP_STORE_URL, set in EAS once the app record exists). */
const IOS_STORE_URL = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL;

/**
 * Which store this phone checks. iPhones only when the build knows its App Store link: a build without one couldn't
 * open the store, so it's never asked to update. Web: only with the dev override.
 */
export function releasePlatform(): AppReleasePlatform | null {
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios" && storeUrls("ios", IOS_STORE_URL).length) return "ios";
  return null;
}

/** This install's build (Android versionCode, iOS CFBundleVersion), or null when unknown (web, Expo Go). */
export function currentBuild(): number | null {
  if (Platform.OS === "web") {
    const dev = read(DEV_BUILD_KEY);
    return dev && /^\d+$/.test(dev) ? Number(dev) : null;
  }
  const raw = Application.nativeBuildVersion;
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** The release for this phone, or null when there's nothing to check or the request didn't work (offline: silent). */
export async function fetchAppRelease(): Promise<AppRelease | null> {
  if (Platform.OS === "web") {
    const dev = read(DEV_RELEASE_KEY);
    if (!dev) return null;
    try {
      return parseAppRelease(JSON.parse(dev));
    } catch {
      return null;
    }
  }
  const platform = releasePlatform();
  if (!platform) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/mobile/app-release?platform=${platform}`, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
    return body?.data ? parseAppRelease(body.data) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function readUpdateSnooze(): UpdateSnooze | null {
  return parseSnooze(read(SNOOZE_KEY));
}

/** "Later": don't show the "new version" sheet for this build for three days. */
export function snoozeUpdate(latestBuild: number) {
  write(SNOOZE_KEY, JSON.stringify(snoozeFor(latestBuild, Date.now())));
}

/** Opens the app's store page: Google Play (the Play Store app, else its website), or the App Store on iPhones. */
export async function openAppStore(): Promise<boolean> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  const urls = storeUrls(platform, IOS_STORE_URL);
  // The web can't open market:// links: straight to the Play Store website.
  const tries = Platform.OS === "web" ? urls.filter((url) => url.startsWith("https://")) : urls;
  if (!tries.length) return false;
  for (const url of tries) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Try the next one (no Play Store app: its website).
    }
  }
  Alert.alert(tNow("m_ui")(platform === "ios" ? "update.storeFailedIos" : "update.storeFailed"));
  return false;
}
