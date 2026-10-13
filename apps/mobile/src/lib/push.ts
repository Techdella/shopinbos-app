import "expo-sqlite/localStorage/install";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { ANDROID_CHANNELS } from "@shared/notifications";
import { api, API_URL } from "./api";
import { riderToken } from "./rider";

// Push notifications on the phone (expo-notifications): Android channels, asking for permission at a good moment
// (never at launch), getting this phone's Expo push token and saving it with /api/notifications/devices, for the
// signed-in account or for a rider (their private link token). Needs a development or store build (EAS):
// Expo Go can't receive pushes, and every call here quietly does nothing there or on the web.

const TOKEN_KEY = "shopinbos.push.token";
const ASKED_KEY = "shopinbos.push.askedAt";
const DISMISSED_KEY = "shopinbos.push.promptDismissedAt";
/** Switched off in the app's settings (the phone still allows it): don't register again until switched back on. */
const OFF_KEY = "shopinbos.push.offHere";

export type PushPermission = "granted" | "undetermined" | "denied" | "unsupported";

export const pushSupported = Platform.OS === "ios" || Platform.OS === "android";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable: fine
  }
}

let configured = false;

/** Foreground pushes don't pop a system banner: PushManager shows its own in-app banner instead. */
export function configurePush() {
  if (!pushSupported || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  if (Platform.OS === "android") {
    for (const channel of ANDROID_CHANNELS) {
      void Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: channel.id === "marketing" ? Notifications.AndroidImportance.DEFAULT : Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 200, 120, 200],
        lightColor: "#FF6A2B",
      }).catch(() => null);
    }
  }
}

export async function pushPermission(): Promise<PushPermission> {
  if (!pushSupported || !Device.isDevice) return "unsupported";
  try {
    const status = await Notifications.getPermissionsAsync();
    if (status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return "granted";
    return status.canAskAgain === false || status.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
}

/** Show the friendly "Turn on notifications" card? Not if decided, asked already, or "Not now" in the last two weeks. */
export async function shouldOfferPush(): Promise<boolean> {
  if ((await pushPermission()) !== "undetermined") return false;
  const dismissed = Number(read(DISMISSED_KEY) ?? 0);
  return !(dismissed && Date.now() - dismissed < 14 * 24 * 60 * 60 * 1000);
}

export function pushTurnedOffHere() {
  return read(OFF_KEY) === "1";
}

export function dismissPushOffer() {
  write(DISMISSED_KEY, String(Date.now()));
}

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

async function expoToken(): Promise<string | null> {
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    return data || null;
  } catch {
    return null; // Expo Go, simulator, no EAS project id, or offline
  }
}

async function sendToken(token: string) {
  const body = { provider: "expo", platform: Platform.OS, token, appVersion: Constants.expoConfig?.version ?? undefined, deviceName: Device.modelName ?? undefined };
  const rider = riderToken();
  const signedIn = await api<unknown>("/api/notifications/devices", { method: "POST", json: body }).then(() => true).catch(() => false);
  // Riders have no account: their link token is their key.
  if (!signedIn && rider) {
    await fetch(`${API_URL}/api/notifications/devices`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "X-Rider-Token": rider }, body: JSON.stringify(body) }).catch(() => null);
  }
}

/** Asks for permission (from a tap), then registers. Returns the permission after asking. */
export async function turnOnPush(): Promise<PushPermission> {
  if (!pushSupported || !Device.isDevice) return "unsupported";
  configurePush();
  write(ASKED_KEY, String(Date.now()));
  write(OFF_KEY, null);
  let permission = await pushPermission();
  if (permission === "undetermined") {
    const result = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }).catch(() => null);
    permission = result?.granted ? "granted" : result?.canAskAgain === false || result?.status === "denied" ? "denied" : "undetermined";
  }
  if (permission === "granted") await registerPushDevice();
  return permission;
}

/** Saves this phone's token (when permission is already granted). Safe to call on every launch and sign-in. */
export async function registerPushDevice() {
  if (pushTurnedOffHere() || (await pushPermission()) !== "granted") return false;
  configurePush();
  const token = await expoToken();
  if (!token) return false;
  write(TOKEN_KEY, token);
  await sendToken(token);
  return true;
}

/** Signing out, or switching off (`turnOff`: stays off on this phone until switched back on). */
export async function unregisterPushDevice(options: { turnOff?: boolean } = {}) {
  if (options.turnOff) write(OFF_KEY, "1");
  const token = read(TOKEN_KEY);
  if (!token) return;
  await api("/api/notifications/devices", { method: "DELETE", json: { token } }).catch(() => null);
  const rider = riderToken();
  if (rider) {
    await fetch(`${API_URL}/api/notifications/devices`, { method: "DELETE", headers: { "Content-Type": "application/json", "X-Rider-Token": rider }, body: JSON.stringify({ token }) }).catch(() => null);
  }
}

export async function setAppBadge(count: number) {
  if (!pushSupported) return;
  await Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => false);
}
