import "expo-sqlite/localStorage/install";
import { api } from "@/lib/api";
import { MAX_INTROS_SEEN, parsePreferences } from "@shared/preferences";

// Which 60-second intros this person has seen: the same User.preferences.introsSeen the web app uses
// (GET / PATCH /api/app/preferences), with this phone's copy as the fallback when the server can't be reached.

const localKey = (uid: string) => `shopinbos.intros-seen.${uid}`;

export function introsSeenOnPhone(uid: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(uid)) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberOnPhone(uid: string, key: string) {
  try {
    const seen = introsSeenOnPhone(uid).filter((item) => item !== key);
    localStorage.setItem(localKey(uid), JSON.stringify([...seen, key].slice(-MAX_INTROS_SEEN)));
  } catch {
    // No storage: the server copy is the record.
  }
}

/** The server's list, or null when it couldn't be loaded (the caller then uses the phone's copy). */
export async function loadIntrosSeen(): Promise<string[] | null> {
  try {
    return parsePreferences(await api<unknown>("/api/app/preferences")).introsSeen ?? [];
  } catch {
    return null;
  }
}

/** Marks an intro seen on the phone at once and on the server (which only ever adds to the list). */
export async function markIntroSeen(uid: string, key: string) {
  rememberOnPhone(uid, key);
  try {
    await api("/api/app/preferences", { method: "PATCH", json: { introsSeen: [key] } });
  } catch {
    // Offline: the phone's copy stops it showing again here; the next save carries on.
  }
}
