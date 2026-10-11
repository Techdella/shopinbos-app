"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PREFERENCES, parsePreferences, type AppPreferences } from "@shared/preferences";

export interface ShellCounts {
  notifications: number;
  inbox: number;
  orders: number;
  preferences?: AppPreferences;
}

// One request per page load, shared by the sidebar badges, the top bar bell and the menu preferences.
let pending: Promise<ShellCounts | null> | null = null;

function loadCounts() {
  pending ??= fetch("/api/app/shell-counts")
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { data?: ShellCounts } | null) => body?.data ?? null)
    .catch(() => null);
  return pending;
}

export function useShellCounts() {
  const [counts, setCounts] = useState<ShellCounts | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCounts().then((value) => alive && setCounts(value));
    return () => {
      alive = false;
    };
  }, []);
  return counts;
}

/** The top bar's menu button and the sidebar talk through this event (they render in different trees). */
export const TOGGLE_NAV_EVENT = "shopinbos:toggle-nav";

// Menu preferences: cached in localStorage so the sidebar doesn't flash switched-off items, confirmed by the
// server on each load, and broadcast when changed so every open component updates.
const PREFS_KEY = "shopinbos:prefs";
const PREFS_EVENT = "shopinbos:prefs";

function cachedPreferences(): AppPreferences {
  try {
    return parsePreferences(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function broadcast(prefs: AppPreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode: the server copy still applies on the next load.
  }
  window.dispatchEvent(new CustomEvent<AppPreferences>(PREFS_EVENT, { detail: prefs }));
}

export function usePreferences() {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);
  useEffect(() => {
    setPrefs(cachedPreferences());
    const onChange = (event: Event) => setPrefs((event as CustomEvent<AppPreferences>).detail);
    window.addEventListener(PREFS_EVENT, onChange);
    void loadCounts().then((counts) => {
      if (counts?.preferences) broadcast(parsePreferences(counts.preferences));
    });
    return () => window.removeEventListener(PREFS_EVENT, onChange);
  }, []);

  async function save(patch: Partial<AppPreferences>) {
    const optimistic = { ...(prefs ?? DEFAULT_PREFERENCES), ...patch };
    broadcast(optimistic);
    const response = await fetch("/api/app/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const body = (await response.json().catch(() => null)) as { data?: AppPreferences } | null;
    if (!response.ok || !body?.data) {
      broadcast(prefs ?? DEFAULT_PREFERENCES);
      throw new Error("Couldn't save that. Try again.");
    }
    broadcast(parsePreferences(body.data));
  }

  return { prefs, loaded: prefs !== null, save };
}
