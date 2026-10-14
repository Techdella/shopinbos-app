import "expo-sqlite/localStorage/install";
import type { TFunction } from "@shared/i18n";
import type { Dashboard } from "./dashboard";

// What the app remembers between launches on this phone, per signed-in seller:
// - whether Home has loaded here before (first open shows "Opening your shop", later opens the Home skeleton)
// - whether onboarding is finished (later launches skip the onboarding check and go straight to Home)
// - the shop name (for "Opening <shop>")
// - the last Home (dashboard) response, shown when the network is slow or offline.
// Stored in expo-sqlite's localStorage, the same storage the Supabase session uses. Cleared on sign-out.

const PREFIX = "shopinbos.launch.";
const key = (uid: string, name: string) => `${PREFIX}${name}.${uid}`;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function write(k: string, value: string) {
  try {
    localStorage.setItem(k, value);
  } catch {
    // Storage full or unavailable: the app still works, it just forgets.
  }
}

export const hasOpenedHome = (uid: string) => read(key(uid, "homeOpened")) === "1";
export const markHomeOpened = (uid: string) => write(key(uid, "homeOpened"), "1");

export const onboardingFinished = (uid: string) => read(key(uid, "finished")) === "1";
export const rememberOnboardingFinished = (uid: string) => write(key(uid, "finished"), "1");

export const rememberedStoreName = (uid: string) => read(key(uid, "storeName"));
export const rememberStoreName = (uid: string, name: string | null | undefined) => {
  if (name?.trim()) write(key(uid, "storeName"), name.trim());
};

export interface CachedDashboard {
  savedAt: number;
  data: Dashboard;
}

export function cachedDashboard(uid: string): CachedDashboard | null {
  const raw = read(key(uid, "dashboard"));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedDashboard;
    return parsed && typeof parsed.savedAt === "number" && parsed.data?.store ? parsed : null;
  } catch {
    return null;
  }
}

export function cacheDashboard(uid: string, data: Dashboard) {
  write(key(uid, "dashboard"), JSON.stringify({ savedAt: Date.now(), data } satisfies CachedDashboard));
}

/** Forget everything above for every seller (on sign-out, so a shared phone doesn't keep the last shop's numbers). */
export function clearLaunchCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Nothing to clear.
  }
}

/** "just now", "2 min ago", "3 hours ago", "yesterday", "4 days ago" (m_home "ago.*" in the app language when `t` is given). */
export function timeAgo(since: number, now = Date.now(), t?: Pick<TFunction, "dynamic">) {
  const say = (key: string, english: string, count?: number) => (t ? t.dynamic(key, english, { count }) : english);
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) return say("ago.justNow", "just now");
  if (minutes < 60) return say("ago.minutes", `${minutes} min ago`, minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return say("ago.hours", `${hours} hour${hours === 1 ? "" : "s"} ago`, hours);
  const days = Math.floor(hours / 24);
  return days === 1 ? say("ago.yesterday", "yesterday") : say("ago.days", `${days} days ago`, days);
}

/** Short, practical tips Peggy shows while the shop opens (translated as m_home "tip.1"… "tip.6", in this order). */
export const PEGGY_TIPS = [
  "Reply to WhatsApp chats within the hour. Quick replies turn more questions into orders.",
  "Put a price on every product. Buyers scroll past “DM for price”.",
  "Share your shop link on your WhatsApp Status. Most first orders come from people who already know you.",
  "Record cash and transfer sales too, so your totals on Home show your whole day.",
  "Bright photos on a plain background sell faster. Daylight near a window works well.",
  "Keep your stock numbers right, so nobody pays for something you’ve run out of.",
] as const;
