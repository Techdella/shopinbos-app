import "expo-sqlite/localStorage/install";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { api, appHeaders } from "./api";
import { supabase } from "./supabase";
import { useSession } from "./session";

// Pilot features (shared/feature-switches.ts; set in Admin › Pilot features). The server says which features are
// on for this account on this app and version (GET /api/app/features); this keeps that list in memory and on the
// phone (per account), asks again when the app opens and when it comes back to the front (at most once a minute),
// and starts with everything OFF: until the first answer only the saved list counts, and offline keeps the saved list.
//
//   const on = useFeature("post_to_plug");   // false until the server says it's on

const CACHE_KEY = "shopinbos.features.v1";
const MIN_GAP_MS = 60_000;

type Saved = { userId: string; features: string[]; at: number };

const NONE: ReadonlySet<string> = new Set();
let userId: string | null = null;
let features: ReadonlySet<string> = new Set();
let lastFetch = 0;
let inFlight: Promise<void> | null = null;
let watching = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved) : null;
    return parsed && typeof parsed.userId === "string" && Array.isArray(parsed.features) ? parsed : null;
  } catch {
    return null;
  }
}

function save(value: Saved) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the list just isn't remembered between launches.
  }
}

function setFeatures(next: readonly string[]) {
  const same = next.length === features.size && next.every((key) => features.has(key));
  if (same) return;
  features = new Set(next);
  emit();
}

/** Switches to this account (or none): its saved list, or nothing. */
function switchAccount(id: string | null) {
  if (id === userId) return;
  userId = id;
  lastFetch = 0;
  const saved = id ? readSaved() : null;
  // A new Set every time, so screens showing the previous account re-render for this one.
  features = new Set(saved && saved.userId === id ? saved.features : []);
  emit();
}

/** Asks the server again (skipped when asked within the last minute, unless forced). Never throws. */
export async function refreshFeatures(force = false): Promise<void> {
  if (!userId) return;
  if (!force && Date.now() - lastFetch < MIN_GAP_MS) return;
  if (inFlight) return inFlight;
  const forUser = userId;
  lastFetch = Date.now();
  inFlight = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const answer = await api<{ features?: unknown }>("/api/app/features", { headers: appHeaders() });
      const list = Array.isArray(answer?.features) ? answer.features.filter((key): key is string => typeof key === "string") : [];
      if (forUser !== userId) return;
      setFeatures(list);
      save({ userId: forUser, features: list, at: Date.now() });
    } catch {
      // Offline or a hiccup: keep what we have (the saved list, else everything off).
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function watchForeground() {
  if (watching) return;
  watching = true;
  AppState.addEventListener("change", (state) => {
    if (state === "active") void refreshFeatures();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every pilot feature on for this account on this app (empty until the server says otherwise). */
export function useFeatures(): ReadonlySet<string> {
  const { session } = useSession();
  const id = session?.user.id ?? null;
  useEffect(() => {
    switchAccount(id);
    watchForeground();
    void refreshFeatures();
  }, [id]);
  const current = useSyncExternalStore(subscribe, () => features, () => features);
  // Another account's list (just switched, before the effect above runs) never shows: everything off.
  return id && id === userId ? current : NONE;
}

/** Is this pilot feature on for this account on this app? Off by default, while loading and when anything fails. */
export function useFeature(key: string): boolean {
  return useFeatures().has(key);
}

/** Redeems a pilot invite code (POST /api/app/features/invite), then asks for the features again. Throws ApiError. */
export async function redeemFeatureInvite(code: string): Promise<string[]> {
  const result = await api<{ features: string[] }>("/api/app/features/invite", { method: "POST", json: { code } });
  await refreshFeatures(true);
  return result.features ?? [];
}
