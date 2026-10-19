import "expo-sqlite/localStorage/install";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { MAX_INTROS_SEEN, parsePreferences, tipsOn } from "@shared/preferences";

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
    const raw = await api<unknown>("/api/app/preferences");
    syncTipsFromServer(raw);
    return parsePreferences(raw).introsSeen ?? [];
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

// Tips and tooltips on or off (User.preferences.tips, the same switch as the web's Customise your menu).
// Kept on the phone too so the choice holds offline; refreshed from the server when the intros list loads.
const TIPS_KEY = "shopinbos.tips-off";
const tipsListeners = new Set<() => void>();

function readTipsOn(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) !== "1";
  } catch {
    return true;
  }
}

let tipsOnNow = readTipsOn();

function setTipsLocally(on: boolean) {
  tipsOnNow = on;
  try {
    if (on) localStorage.removeItem(TIPS_KEY);
    else localStorage.setItem(TIPS_KEY, "1");
  } catch {
    // No storage: the server copy is the record.
  }
  for (const listener of tipsListeners) listener();
}

export function subscribeTips(listener: () => void) {
  tipsListeners.add(listener);
  return () => {
    tipsListeners.delete(listener);
  };
}

export const tipsOnPhone = () => tipsOnNow;

/** Switches tips and tooltips on or off here at once and on the server; undone if the save fails. */
export async function saveTipsOn(on: boolean) {
  const before = tipsOnNow;
  setTipsLocally(on);
  try {
    await api("/api/app/preferences", { method: "PATCH", json: { tips: on } });
  } catch (error) {
    setTipsLocally(before);
    throw error;
  }
}

/** Applies the server's copy (called with the preferences LearnHost loads). */
export function syncTipsFromServer(raw: unknown) {
  const on = tipsOn(parsePreferences(raw));
  if (on !== tipsOnNow) setTipsLocally(on);
}

/** Whether tips and tooltips are on, following changes. */
export function useTipsOnPhone() {
  return useSyncExternalStore(subscribeTips, tipsOnPhone, tipsOnPhone);
}
